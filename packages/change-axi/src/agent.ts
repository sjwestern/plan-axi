import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { loadRawConfig } from "docs-axi/lib/config";

/** Built-in agent binary -> command template. Only pi is verified; the rest are best-effort and overridable. */
export const AGENT_TABLE: [string, string][] = [
  ["pi", "pi {prompt}"],
  ["claude", "claude {prompt}"],
  ["codex", "codex {prompt}"],
  ["gemini", "gemini -i {prompt}"],
  ["opencode", "opencode --prompt {prompt}"],
];

export interface AgentProfile {
  name: string;
  harness?: string;
  model?: string;
  effort?: string;
  command?: string;
}

export interface AgentChoice {
  template: string;
  source: "repo/user config" | "CHANGE_AXI_AGENT" | "autodetect" | `--agent ${string}` | `tier ${string}`;
  /** Set when chosen via a profile; build the command with buildProfileCommand. */
  profile?: AgentProfile;
}

/** Harness -> argv builder (before the prompt). Only pi is verified. */
const HARNESS_ADAPTERS: Record<string, (p: AgentProfile, q: (s: string) => string) => string> = {
  pi: (p, q) => ["pi", ...(p.model ? ["--model", q(p.model)] : []), ...(p.effort ? ["--thinking", q(p.effort)] : [])].join(" ") + " {prompt}",
};

export type CheckStatus = "ok" | "invalid" | "skipped";

export interface CheckResult {
  status: CheckStatus;
  field: "harness" | "model" | "effort" | "command";
  message: string;
}

/** Side effects of live harness checks, injectable so tests need no real binaries. */
export interface CheckDeps {
  /** Run a binary; output is stdout+stderr combined. `error` is set when it could not run or timed out. */
  run(bin: string, args: string[]): { status: number | null; output: string; error?: string };
  onPath(bin: string): boolean;
}

export const defaultCheckDeps: CheckDeps = {
  run(bin, args) {
    const r = spawnSync(bin, args, { encoding: "utf8", timeout: 20000, maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32" });
    const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    if (r.error) return { status: r.status, output, error: r.error.message };
    return { status: r.status, output };
  },
  onPath: (bin) => onPath(bin),
};

export const PI_THINKING_FALLBACK = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** Thinking levels from the `--thinking` line of `pi --help`, or undefined when not parseable. */
export function parsePiThinkingLevels(help: string): string[] | undefined {
  const m = /--thinking\s+<level>[^\n]*?:\s*([^\n]+)/.exec(help);
  if (!m) return undefined;
  const levels = m[1]!.split(",").map((x) => x.trim()).filter((x) => /^[a-z]+$/.test(x));
  return levels.length > 0 ? levels : undefined;
}

export interface ModelRow {
  provider: string;
  model: string;
}

/** Rows of `pi --list-models` output (provider and model columns). Undefined when the output is neither a table nor a no-match notice. */
export function parsePiModelRows(output: string): ModelRow[] | undefined {
  const lines = output.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.some((l) => /^No models matching/i.test(l.trim()))) return [];
  const headerAt = lines.findIndex((l) => /^\s*provider\s+model\b/i.test(l));
  if (headerAt < 0) return undefined;
  const rows: ModelRow[] = [];
  for (const l of lines.slice(headerAt + 1)) {
    const cols = l.trim().split(/\s+/);
    if (cols.length >= 2) rows.push({ provider: cols[0]!, model: cols[1]! });
  }
  return rows;
}

/** Effort check against pi's levels (pure). */
export function checkPiEffort(effort: string, helpOutput: string | undefined): CheckResult {
  const levels = (helpOutput !== undefined ? parsePiThinkingLevels(helpOutput) : undefined) ?? PI_THINKING_FALLBACK;
  if (levels.includes(effort)) return { status: "ok", field: "effort", message: `effort "${effort}" is valid` };
  return { status: "invalid", field: "effort", message: `effort "${effort}" is not a pi thinking level; use one of: ${levels.join(", ")}` };
}

/** Model check against `pi --list-models <search>` rows (pure). Exact, case-sensitive provider and model match only. */
export function checkPiModel(model: string, rows: ModelRow[] | undefined): CheckResult {
  const field = "model" as const;
  if (rows === undefined) return { status: "skipped", field, message: `could not parse \`pi --list-models\` output; model "${model}" not verified` };
  const slash = model.indexOf("/");
  if (slash < 0) {
    const same = rows.filter((r) => r.model === model).map((r) => `${r.provider}/${r.model}`);
    const hint = same.length > 0 ? `; choose one of: ${same.join(", ")}` : "";
    return { status: "invalid", field, message: `model "${model}" needs a provider, written provider/model${hint}` };
  }
  const provider = model.slice(0, slash);
  const id = model.slice(slash + 1);
  if (rows.some((r) => r.provider === provider && r.model === id)) return { status: "ok", field, message: `model "${model}" found` };
  const near = rows.slice(0, 5).map((r) => `${r.provider}/${r.model}`);
  const hint = near.length > 0 ? `; close matches: ${near.join(", ")}` : "";
  return { status: "invalid", field, message: `model "${model}" is not available in pi${hint}` };
}

function checkPiProfile(p: AgentProfile, deps: CheckDeps): CheckResult[] {
  if (!deps.onPath("pi")) return [{ status: "skipped", field: "harness", message: `pi not found on PATH; profile ${p.name} cannot launch on this machine` }];
  const out: CheckResult[] = [];
  if (p.effort) {
    const r = deps.run("pi", ["--help"]);
    out.push(checkPiEffort(p.effort, r.error ? undefined : r.output));
  }
  if (p.model) {
    const slash = p.model.indexOf("/");
    const search = slash < 0 ? p.model : p.model.slice(slash + 1);
    const r = deps.run("pi", ["--list-models", search]);
    if (r.error) out.push({ status: "skipped", field: "model", message: `pi --list-models failed (${r.error}); model "${p.model}" not verified` });
    else out.push(checkPiModel(p.model, parsePiModelRows(r.output)));
  }
  if (out.length === 0) out.push({ status: "ok", field: "harness", message: "pi found on PATH" });
  return out;
}

/** Harness -> live profile check. Adapters without one are not checked. */
const HARNESS_CHECKS: Record<string, (p: AgentProfile, deps: CheckDeps) => CheckResult[]> = {
  pi: checkPiProfile,
};

/** Live checks for one profile: harness profiles use their adapter, command profiles only check the first word is on PATH. */
export function checkProfile(profile: AgentProfile, deps: CheckDeps = defaultCheckDeps): CheckResult[] {
  if (profile.command) {
    const bin = profile.command.trim().split(/\s+/)[0] ?? "";
    if (!deps.onPath(bin)) return [{ status: "skipped", field: "command", message: `${bin} not found on PATH; profile ${profile.name} cannot launch on this machine` }];
    return [{ status: "ok", field: "command", message: `${bin} found on PATH` }];
  }
  const check = profile.harness ? HARNESS_CHECKS[profile.harness] : undefined;
  if (!check) return [{ status: "skipped", field: "harness", message: `no live check for harness "${profile.harness ?? ""}"; profile ${profile.name} not verified` }];
  return check(profile, deps);
}

/** Profiles from `[apply.agents.<name>]` (harness, model, effort, command); harness required unless command is set. */
export function loadProfiles(root: string): AgentProfile[] {
  const raw = loadRawConfig(root);
  const names: string[] = [];
  const prefix = "apply.agents.";
  for (const k of Object.keys(raw)) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    const i = rest.lastIndexOf(".");
    if (i <= 0) continue;
    const n = rest.slice(0, i);
    if (!names.includes(n)) names.push(n);
  }
  return names.map((name) => {
    const str = (f: string): string | undefined => {
      const v = raw[`${prefix}${name}.${f}`];
      return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
    };
    const profile: AgentProfile = { name };
    for (const f of ["harness", "model", "effort", "command"] as const) {
      const v = str(f);
      if (v !== undefined) profile[f] = v;
    }
    if (!profile.harness && !profile.command) {
      throw new AxiError(`agent profile "${name}" needs harness or command`, "VALIDATION_ERROR", [`Set [apply.agents.${name}] harness = "pi" in .plan-axi.toml`]);
    }
    return profile;
  });
}

/** Command for a profile: its `command` template, else the harness adapter (model/effort flags). */
export function buildProfileCommand(profile: AgentProfile, v: CommandVars, platform: NodeJS.Platform = process.platform): string {
  if (profile.command) return buildCommand(profile.command, v, platform);
  const adapter = profile.harness ? HARNESS_ADAPTERS[profile.harness] : undefined;
  if (!adapter) {
    throw new AxiError(`agent profile "${profile.name}": unsupported harness "${profile.harness ?? ""}"`, "VALIDATION_ERROR", [
      `Supported harnesses: ${Object.keys(HARNESS_ADAPTERS).join(", ")}; or set command = "... {prompt}"`,
    ]);
  }
  return buildCommand(adapter(profile, (s) => shellQuote(s, platform)), v, platform);
}

function profileChoice(p: AgentProfile, source: AgentChoice["source"]): AgentChoice {
  return { template: p.command ?? (HARNESS_ADAPTERS[p.harness ?? ""]?.(p, (s) => s) ?? p.harness ?? p.name), source, profile: p };
}

function onPath(bin: string): boolean {
  const exts = process.platform === "win32" ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").concat("") : [""];
  return (process.env["PATH"] ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((d) => exts.some((x) => existsSync(join(d, bin + x))));
}

/** `--agent` profile, tier profile, then config (`[apply] agent`, repo over user), then env CHANGE_AXI_AGENT, then PATH autodetect. */
export function resolveAgent(root: string, opts: { profile?: string; tierProfile?: string; tier?: string } = {}): AgentChoice | undefined {
  if (opts.profile !== undefined || opts.tierProfile !== undefined) {
    const profiles = loadProfiles(root);
    const find = (n: string, what: string): AgentProfile => {
      const hit = profiles.find((p) => p.name === n);
      if (!hit) {
        throw new AxiError(`unknown agent profile "${n}"${what}`, "VALIDATION_ERROR", [
          profiles.length ? `Defined profiles: ${profiles.map((p) => p.name).join(", ")}` : "No profiles defined: add [apply.agents.<name>] to .plan-axi.toml",
        ]);
      }
      return hit;
    };
    if (opts.profile !== undefined) return profileChoice(find(opts.profile, ""), `--agent ${opts.profile}`);
    const t = opts.tier ?? (opts.tierProfile as string);
    return profileChoice(find(opts.tierProfile as string, ` (tier ${t})`), `tier ${t}`);
  }
  const cfg = loadRawConfig(root)["apply.agent"];
  if (typeof cfg === "string" && cfg.trim() !== "") return { template: cfg.trim(), source: "repo/user config" };
  const env = process.env["CHANGE_AXI_AGENT"];
  if (env && env.trim() !== "") return { template: env.trim(), source: "CHANGE_AXI_AGENT" };
  const hit = AGENT_TABLE.find(([bin]) => onPath(bin));
  return hit ? { template: hit[1], source: "autodetect" } : undefined;
}

export function shellQuote(s: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface CommandVars {
  prompt: string;
  slug: string;
  step?: string;
  path: string;
}

/** Fill `{prompt}`, `{slug}`, `{step}`, `{path}` with shell-quoted values (unknown placeholders stay). */
export function buildCommand(template: string, v: CommandVars, platform: NodeJS.Platform = process.platform): string {
  const vals: Record<string, string> = { prompt: v.prompt, slug: v.slug, step: v.step ?? "", path: v.path };
  return template.replace(/\{(prompt|slug|step|path)\}/g, (_m, k: string) => shellQuote(vals[k] as string, platform));
}

/** Run the command in `cwd` with inherited stdio. Returns the exit code. */
export function runAgent(command: string, cwd: string): number {
  const r = spawnSync(command, { cwd, stdio: "inherit", shell: true });
  return r.status ?? 1;
}
