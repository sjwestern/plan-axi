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
