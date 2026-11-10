import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { docsConfigProblems, parseToml, type Value } from "docs-axi/lib/config";
import { applyTomlEdit, quote, removeKey, removeTable, upsertKey } from "docs-axi/lib/tomlwrite";
import type { AxiStructuredOutput } from "docs-axi/lib/types";
import type { CmdSpec } from "docs-axi/lib/args";
import { PI_THINKING_FALLBACK, checkProfile, type AgentProfile, type CheckResult } from "./agent.js";
import type { Ctx } from "./change.js";
import { checkMerged, checkText, type ConfigFile, type ConfigProblem } from "./configcheck.js";
import { TOKEN, WORD } from "./commitstyle.js";
import { planConfigProblems, readPlanConfig } from "./planconfig.js";
import { TIERS } from "./spec.js";

const FLAGS: Record<string, "string" | "boolean"> = {
  "--profile": "string",
  "--harness": "string",
  "--model": "string",
  "--effort": "string",
  "--command": "string",
  "--tier": "string",
  "--rule": "string",
  "--clear-rules": "string",
  "--default-tier": "string",
  "--agent": "string",
  "--commit-type": "string",
  "--commit-scope": "string",
  "--commit-plan-type": "string",
  "--commit-trailer": "string",
  "--remove-profile": "string",
  "--unset-tier": "string",
  "--user": "boolean",
  "--force": "boolean",
  "--verify": "boolean",
};
const REPEATABLE = new Set(["--tier", "--rule", "--clear-rules", "--unset-tier"]);
const PROFILE_FIELDS = ["--harness", "--model", "--effort", "--command"] as const;

export const CONFIG_SPEC: CmdSpec = {
  name: "config",
  flags: FLAGS,
  min: 0,
  max: 0,
  usage: "change-axi config [write flags] | --verify [--profile <name>]",
  help: `usage: change-axi config [flags]
Show the effective plan config (profiles, tier map, rules, default tier, agent, commit style), or update it.
Writes go to the repo .plan-axi.toml, or the user config with --user. Comments and other settings are kept.
profile flags (need --profile <name>):
  --profile <name> --harness <h> --model <provider/id> --effort <level> --command "<template {prompt}>"
  --remove-profile <name>
tier flags (repeatable):
  --tier <tier>=<profile>   map small|standard|deep to a profile
  --unset-tier <tier>
  --rule <tier>=<text>      append a plain-language rule for plan-propose
  --clear-rules <tier>
  --default-tier <tier>
other:
  --agent "<template>"      [apply] agent command template
  --commit-type / --commit-scope / --commit-plan-type / --commit-trailer <value>
  --user                    write the user config instead of the repo file
  --force                   write even when a model or effort is reported invalid (the model list covers only providers with credentials on this machine)
  --verify [--profile <n>]  validate all config (located problems), then live-check profiles (model, effort, harness on PATH); writes nothing; exits non-zero on any error or invalid profile
Structural errors (unknown tier, undefined profile, profile without harness/command) always fail and leave the file unchanged.
Missing harness or a failed live check is a warning and the file is still written.
examples:
  change-axi config --profile small --harness pi --model provider/model --effort low --tier small=small
  change-axi config --rule standard="db migrations" --default-tier small
  change-axi config --verify
`,
};

type Flags = Record<string, string[]>;

function parseFlags(args: string[]): Flags {
  const out: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) throw new AxiError(`unexpected argument ${arg}`, "VALIDATION_ERROR", [`usage: ${CONFIG_SPEC.usage}`]);
    const eq = arg.indexOf("=");
    const name = eq < 0 ? arg : arg.slice(0, eq);
    const kind = FLAGS[name];
    if (kind === undefined) {
      throw new AxiError(`unknown flag ${name} for \`config\``, "VALIDATION_ERROR", [`valid flags: ${Object.keys(FLAGS).join(", ")}`]);
    }
    let value = "true";
    if (kind === "string") {
      const v = eq >= 0 ? arg.slice(eq + 1) : args[++i];
      if (v === undefined || (eq < 0 && v.startsWith("--"))) throw new AxiError(`${name} requires a value`, "VALIDATION_ERROR");
      if (v.trim() === "" && name !== "--commit-scope") throw new AxiError(`${name} requires a non-empty value`, "VALIDATION_ERROR");
      if (/[\r\n]/.test(v)) throw new AxiError(`${name} must be a single line`, "VALIDATION_ERROR");
      value = v;
    } else if (eq >= 0) throw new AxiError(`${name} does not take a value`, "VALIDATION_ERROR");
    const list = (out[name] ??= []);
    if (list.length > 0 && !REPEATABLE.has(name)) throw new AxiError(`${name} given more than once`, "VALIDATION_ERROR");
    list.push(value);
  }
  return out;
}

function pair(flag: string, value: string): [string, string] {
  const i = value.indexOf("=");
  if (i < 1 || value.slice(i + 1).trim() === "") throw new AxiError(`${flag} expects <tier>=<value>, got ${value}`, "VALIDATION_ERROR");
  return [value.slice(0, i).trim(), value.slice(i + 1).trim()];
}

function tierName(flag: string, t: string): string {
  if (!(TIERS as readonly string[]).includes(t)) throw new AxiError(`unknown tier "${t}" for ${flag}`, "VALIDATION_ERROR", [`valid tiers: ${TIERS.join(", ")}`]);
  return t;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const profileName = (flag: string, n: string): string => {
  if (!NAME_RE.test(n)) throw new AxiError(`${flag} name "${n}" must match ${NAME_RE}`, "VALIDATION_ERROR");
  return n;
};

function userConfigPath(): string {
  return join(process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config"), "plan-axi", "config.toml");
}

const COMMIT: [string, string, string, RegExp, boolean][] = [
  ["--commit-type", "type", "commit type", WORD, false],
  ["--commit-scope", "scope", "commit scope", WORD, true],
  ["--commit-plan-type", "plan_type", "commit plan type", WORD, false],
  ["--commit-trailer", "trailer", "commit trailer", TOKEN, true],
];

const WRITE_FLAGS = Object.keys(FLAGS).filter((f) => !["--verify", "--user", "--force", "--profile"].includes(f));

function profileFromRaw(raw: Record<string, Value>, name: string): AgentProfile {
  const p: AgentProfile = { name };
  for (const f of ["harness", "model", "effort", "command"] as const) {
    const v = raw[`apply.agents.${name}.${f}`];
    if (typeof v === "string" && v.trim() !== "") p[f] = v.trim();
  }
  return p;
}

function readRaw(path: string): Record<string, Value> {
  return existsSync(path) ? parseToml(readFileSync(path, "utf8"), path) : {};
}

function merge(user: Record<string, Value>, repo: Record<string, Value>): Record<string, Value> {
  const out: Record<string, Value> = { ...user };
  for (const [k, v] of Object.entries(repo)) {
    const prev = out[k];
    out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v.filter((x) => !prev.includes(x))] : v;
  }
  return out;
}

const worst = (rs: CheckResult[]): CheckResult["status"] => (rs.some((r) => r.status === "invalid") ? "invalid" : rs.some((r) => r.status === "skipped") ? "skipped" : "ok");

/** All config problems: each file alone, the merged view, and `[docs]` (located, errors and warnings). */
function configProblems(root: string): { problems: ConfigProblem[]; files: ConfigFile[]; unparseable: boolean } {
  const problems: ConfigProblem[] = [];
  const files: ConfigFile[] = [];
  let unparseable = false;
  for (const path of [userConfigPath(), join(root, ".plan-axi.toml")]) {
    if (!existsSync(path)) continue;
    const r = checkText(path, readFileSync(path, "utf8"));
    problems.push(...r.problems);
    if (r.raw) files.push({ file: path, raw: r.raw });
    else unparseable = true;
  }
  problems.push(...checkMerged(files));
  for (const d of docsConfigProblems(root)) {
    // syntax errors are already reported by checkText
    if (d.key === "" && problems.some((p) => p.file === d.file && p.key === "")) continue;
    problems.push({ file: d.file, key: d.key, severity: "error", message: d.message });
  }
  return { problems, files, unparseable };
}

function verifyRows(root: string, names: string[] | undefined): AxiStructuredOutput {
  const { problems, files, unparseable } = configProblems(root);
  const raw = files.reduce<Record<string, Value>>((acc, f) => merge(acc, f.raw), {});
  const defined: string[] = [];
  for (const k of Object.keys(raw)) {
    if (!k.startsWith("apply.agents.")) continue;
    const rest = k.slice("apply.agents.".length);
    const i = rest.lastIndexOf(".");
    if (i > 0 && !defined.includes(rest.slice(0, i))) defined.push(rest.slice(0, i));
  }
  for (const n of names ?? []) {
    if (!defined.includes(n)) throw new AxiError(`unknown agent profile "${n}"`, "VALIDATION_ERROR", [`Defined profiles: ${defined.join(", ") || "none"}`]);
  }
  const rows: Array<{ profile: string; status: CheckResult["status"]; reason: string }> = [];
  if (!unparseable) {
    for (const name of names ?? defined) {
      const prof = profileFromRaw(raw, name);
      if (!prof.harness && !prof.command) continue; // reported as a problem
      const results = checkProfile(prof);
      const reasons = results.filter((r) => r.status !== "ok").map((r) => r.message);
      rows.push({ profile: name, status: worst(results), reason: reasons.length > 0 ? reasons.join("; ") : results.map((r) => r.message).join("; ") });
    }
  }
  if (problems.some((p) => p.severity === "error") || rows.some((r) => r.status === "invalid")) process.exitCode = 1;
  const out: Record<string, unknown> = {
    problems: problems.length === 0 ? "none" : problems.map((p) => ({ file: p.file, key: p.key, severity: p.severity, message: p.message })),
    verify: rows.length > 0 ? rows : "no profiles defined",
  };
  if (rows.length === 0 && defined.length === 0) out["help"] = ["Add one: change-axi config --profile <name> --harness pi --model <provider/id>"];
  return out as AxiStructuredOutput;
}

export function configCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const flags = parseFlags(args);
  const has = (f: string): boolean => (flags[f]?.length ?? 0) > 0;
  const one = (f: string): string | undefined => flags[f]?.[0];
  const writeFlags = WRITE_FLAGS.filter(has);
  const profile = one("--profile");
  const profileFieldFlags = PROFILE_FIELDS.filter(has);

  if (has("--verify")) {
    if (writeFlags.length > 0 || has("--user") || has("--force")) {
      throw new AxiError(`--verify cannot be combined with ${[...writeFlags, ...["--user", "--force"].filter(has)].join(", ")}`, "VALIDATION_ERROR", ["--verify never writes"]);
    }
    return verifyRows(ctx.root, profile === undefined ? undefined : [profile]);
  }
  if (has("--force") && writeFlags.length === 0 && profile === undefined) throw new AxiError("--force needs a write flag", "VALIDATION_ERROR");
  if (profileFieldFlags.length > 0 && profile === undefined) {
    throw new AxiError(`${profileFieldFlags.join(", ")} need --profile <name>`, "VALIDATION_ERROR");
  }
  if (profile !== undefined && profileFieldFlags.length === 0) {
    throw new AxiError("--profile needs --harness, --model, --effort or --command (or use --verify)", "VALIDATION_ERROR");
  }
  const writing = writeFlags.length > 0 || profileFieldFlags.length > 0;
  const warnings: string[] = [];
  let written: string | undefined;

  if (writing) {
    const user = has("--user");
    const target = user ? userConfigPath() : join(ctx.root, ".plan-axi.toml");
    const otherRaw = user ? readRaw(join(ctx.root, ".plan-axi.toml")) : readRaw(userConfigPath());
    const targetRaw = readRaw(target);
    const edits: Array<(lines: string[]) => void> = [];

    if (profile !== undefined) {
      const table = `apply.agents.${profileName("--profile", profile)}`;
      for (const f of PROFILE_FIELDS) {
        const v = one(f);
        if (v !== undefined) edits.push((l) => upsertKey(l, table, f.slice(2), quote(v)));
      }
    }
    for (const name of flags["--remove-profile"] ?? []) {
      const table = `apply.agents.${profileName("--remove-profile", name)}`;
      edits.push((l) => {
        if (!removeTable(l, table)) throw new AxiError(`no profile "${name}" in ${user ? "the user" : "the repo"} config`, "VALIDATION_ERROR");
      });
    }
    for (const v of flags["--tier"] ?? []) {
      const [t, p] = pair("--tier", v);
      tierName("--tier", t);
      edits.push((l) => upsertKey(l, "apply.tiers", t, quote(p)));
    }
    for (const t of flags["--unset-tier"] ?? []) {
      tierName("--unset-tier", t);
      edits.push((l) => {
        if (!removeKey(l, "apply.tiers", t)) throw new AxiError(`tier "${t}" is not mapped in ${user ? "the user" : "the repo"} config`, "VALIDATION_ERROR");
      });
    }
    const cleared = new Set((flags["--clear-rules"] ?? []).map((t) => tierName("--clear-rules", t)));
    for (const t of cleared) edits.push((l) => void removeKey(l, "propose.tiers", t));
    const ruleAdds = new Map<string, string[]>();
    for (const v of flags["--rule"] ?? []) {
      const [t, text] = pair("--rule", v);
      tierName("--rule", t);
      const list = ruleAdds.get(t) ?? [];
      list.push(text);
      ruleAdds.set(t, list);
    }
    for (const [t, add] of ruleAdds) {
      const prev = cleared.has(t) ? undefined : targetRaw[`propose.tiers.${t}`];
      const existing = Array.isArray(prev) ? prev : typeof prev === "string" && prev.trim() !== "" ? [prev] : [];
      const all = [...existing, ...add.filter((x) => !existing.includes(x))];
      edits.push((l) => upsertKey(l, "propose.tiers", t, `[${all.map(quote).join(", ")}]`));
    }
    const dt = one("--default-tier");
    if (dt !== undefined) edits.push((l) => upsertKey(l, "propose", "default_tier", quote(tierName("--default-tier", dt))));
    const agent = one("--agent");
    if (agent !== undefined) edits.push((l) => upsertKey(l, "apply", "agent", quote(agent)));
    for (const [flag, key, label, re, allowEmpty] of COMMIT) {
      const v = one(flag);
      if (v === undefined) continue;
      if (v === "" ? !allowEmpty : !re.test(v)) throw new AxiError(`invalid ${label} ${JSON.stringify(v)}`, "VALIDATION_ERROR", [`${flag} must match ${re}${allowEmpty ? " or be empty" : ""}`]);
      edits.push((l) => upsertKey(l, "commit", key, quote(v)));
    }

    const force = has("--force");
    applyTomlEdit(
      target,
      (lines) => {
        for (const e of edits) e(lines);
      },
      (candidate) => {
        const candRaw = parseToml(candidate, target);
        const raw = user ? merge(candRaw, otherRaw) : merge(otherRaw, candRaw);
        const problems = planConfigProblems(raw);
        if (problems.length > 0) {
          throw new AxiError(problems.join("; "), "VALIDATION_ERROR", [...problems.map((p) => `Fix: ${p}`), "The file was not changed; --force does not bypass structural errors"]);
        }
        if (profile === undefined) return;
        const invalid: string[] = [];
        for (const r of checkProfile(profileFromRaw(raw, profile))) {
          if (r.status === "invalid") invalid.push(r.message);
          else if (r.status === "skipped") warnings.push(r.message);
        }
        if (invalid.length > 0) {
          if (!force) {
            throw new AxiError(invalid.join("; "), "VALIDATION_ERROR", [
              "The file was not changed",
              "Use --force to write anyway (the model list covers only providers with credentials on this machine)",
            ]);
          }
          warnings.push(...invalid.map((m) => `${m} (written with --force)`));
        }
      },
    );
    written = target;
  }

  const cfg = readPlanConfig(ctx.root);
  const out: AxiStructuredOutput = {};
  if (written) out["written"] = written;
  if (warnings.length > 0) out["warnings"] = warnings;
  out["profiles"] = cfg.profiles.length > 0
    ? cfg.profiles.map((p) => ({ profile: p.name, harness: p.harness ?? "-", model: p.model ?? "-", effort: p.effort ?? "-", command: p.command ?? "-" }))
    : "none";
  out["tiers"] = cfg.resolved.map((r) => ({ tier: r.tier, profile: r.profile ?? cfg.tiers[r.tier] ?? "-", model: r.model ?? "-", effort: r.effort ?? "-", rules: cfg.rules[r.tier].length > 0 ? cfg.rules[r.tier].join("; ") : "-" }));
  out["default_tier"] = cfg.default_tier ?? "none";
  out["agent"] = cfg.agent ?? "none";
  out["commit"] = { type: cfg.commit.type, scope: cfg.commit.scope || "-", plan_type: cfg.commit.planType, trailer: cfg.commit.trailer || "-" };
  out["effort_levels"] = PI_THINKING_FALLBACK.join(", ");
  const help: string[] = [];
  if (cfg.profiles.some((p) => p.harness)) help.push("Run `change-axi config --verify` to live-check models and efforts (can be slow)");
  help.push("Run `change-axi guidance` for the tier rules plan-propose uses");
  out["help"] = help;
  return out;
}

