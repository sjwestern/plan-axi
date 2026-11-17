import { parseToml, type Value } from "docs-axi/lib/config";
import { TOKEN, WORD } from "./commitstyle.js";
import { TIERS } from "./spec.js";

export type Severity = "error" | "warning";

export interface ConfigProblem {
  file: string;
  key: string;
  severity: Severity;
  message: string;
}

export interface ConfigFile {
  file: string;
  raw: Record<string, Value>;
}

export const REPO_PLATFORMS = ["windows", "native"] as const;
export const REPO_KEYS = ["path", "platform", "git", "treehouse", "docs"] as const;
export const PROFILE_KEYS = ["harness", "model", "effort", "command"] as const;
export const COMMAND_PLACEHOLDERS = ["prompt", "slug", "step", "path", "repos"] as const;

/**
 * Known keys. `<n>` is a free name segment, `<tier>` a tier name. Docs keys are known-only here:
 * their values are checked by docs-axi.
 */
export const KNOWN_KEYS: readonly string[] = [
  "apply.agent",
  ...PROFILE_KEYS.map((f) => `apply.agents.<n>.${f}`),
  "apply.tiers.<tier>",
  "propose.default_tier",
  "propose.tiers.<tier>",
  "commit.type",
  "commit.scope",
  "commit.plan_type",
  "commit.trailer",
  ...REPO_KEYS.map((f) => `repos.<n>.${f}`),
  "docs.dir",
  "docs.sections",
  "docs.adr",
  "docs.ignore",
  "docs.map.<n>",
  "docs.section.<n>.guide",
];

const SEG = "[^.]+";
const KNOWN_RES: RegExp[] = KNOWN_KEYS.map((p) => {
  const re = p
    .split(".")
    .map((s) => (s === "<n>" ? SEG : s === "<tier>" ? `(?:${TIERS.join("|")}|${SEG})` : s))
    .join("\\.");
  return new RegExp(`^${re}$`);
});

export function isKnownKey(key: string): boolean {
  return KNOWN_RES.some((re) => re.test(key));
}

/** One concrete example key per schema entry (`<n>` -> "x", `<tier>` -> "small"). */
export function sampleKeys(): string[] {
  return KNOWN_KEYS.map((p) => p.replace(/<n>/g, "x").replace(/<tier>/g, "small"));
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] as number;
      prev[j] = Math.min(up + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] as number;
}

/** Closest known key within edit distance 2, keeping the user's own names/tiers where the shape matches. */
function suggest(key: string): string | undefined {
  const parts = key.split(".");
  let best: { key: string; d: number } | undefined;
  for (const p of KNOWN_KEYS) {
    const kp = p.split(".");
    let cand = p;
    if (kp.length === parts.length) {
      // keep the user's free segments so only the fixed part is compared
      cand = kp.map((s, i) => (s === "<n>" || s === "<tier>" ? (parts[i] as string) : s)).join(".");
    } else if (p.includes("<")) continue;
    const d = editDistance(key, cand);
    if (d <= 2 && d > 0 && (best === undefined || d < best.d)) best = { key: cand, d };
  }
  return best?.key;
}

const isStr = (v: Value | undefined): v is string => typeof v === "string";
const nonEmpty = (v: Value | undefined): v is string => isStr(v) && v.trim() !== "";
const show = (v: Value): string => JSON.stringify(v);

/** Problems with `{placeholders}` in an agent command template. */
function templateProblems(key: string, v: string): Array<{ severity: Severity; message: string }> {
  const out: Array<{ severity: Severity; message: string }> = [];
  if (!v.includes("{prompt}")) out.push({ severity: "error", message: `${key} must contain {prompt}, or the agent never receives its task` });
  for (const m of v.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
    const name = m[1] as string;
    if (!(COMMAND_PLACEHOLDERS as readonly string[]).includes(name) && !v.includes(`\${${name}}`)) {
      out.push({ severity: "warning", message: `${key}: unknown placeholder {${name}}; known: ${COMMAND_PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}` });
    }
  }
  return out;
}

function checkValue(key: string, v: Value): Array<{ severity: Severity; message: string }> {
  const err = (message: string) => [{ severity: "error" as const, message }];
  const parts = key.split(".");
  const [t0, t1] = parts;
  const last = parts[parts.length - 1] as string;
  if (key === "apply.agent") return nonEmpty(v) ? templateProblems(key, v) : err("apply.agent must be a non-empty command template");
  if (t0 === "apply" && t1 === "agents") {
    if (last === "command") return nonEmpty(v) ? templateProblems(key, v) : err(`${key} must be a non-empty command template`);
    return isStr(v) ? [] : err(`${key} must be a string`);
  }
  if (t0 === "apply" && t1 === "tiers") {
    if (!(TIERS as readonly string[]).includes(last)) return err(`unknown tier "${last}" in [apply.tiers]; valid tiers: ${TIERS.join(", ")}`);
    return nonEmpty(v) ? [] : err(`tier "${last}" must map to a profile name`);
  }
  if (key === "propose.default_tier") {
    return isStr(v) && (TIERS as readonly string[]).includes(v.trim()) ? [] : err(`default_tier ${show(v)} is not valid; use one of: ${TIERS.join(", ")}`);
  }
  if (t0 === "propose" && t1 === "tiers") {
    if (!(TIERS as readonly string[]).includes(last)) return err(`unknown tier "${last}" in [propose.tiers]; valid tiers: ${TIERS.join(", ")}`);
    return isStr(v) || (Array.isArray(v) && v.every((x) => typeof x === "string")) ? [] : err(`${key} must be a string or an array of strings`);
  }
  if (t0 === "commit") {
    const re = last === "trailer" ? TOKEN : WORD;
    const allowEmpty = last === "scope" || last === "trailer";
    if (!isStr(v) || (v === "" ? !allowEmpty : !re.test(v))) return err(`${key} ${show(v)} must match ${re}${allowEmpty ? " or be empty" : ""}`);
    return [];
  }
  if (t0 === "repos") {
    const name = parts.slice(1, -1).join(".");
    if (!nonEmpty(v)) return err(`[repos.${name}] ${last} must be a non-empty string`);
    if (last === "platform" && !(REPO_PLATFORMS as readonly string[]).includes(v.trim())) {
      return err(`[repos.${name}] platform "${v}" is not valid; use one of: ${REPO_PLATFORMS.join(", ")}`);
    }
    if (last === "docs" && (/^([A-Za-z]:)?[\\/]/.test(v.trim()) || v.trim().split(/[\\/]/).includes(".."))) {
      return err(`[repos.${name}] docs "${v}" must be a relative directory inside the repo`);
    }
  }
  return [];
}

/** Validate one parsed config file: key names, value types and templates. Cross-file rules live in checkMerged. */
export function checkFile(file: string, raw: Record<string, Value>): ConfigProblem[] {
  const out: ConfigProblem[] = [];
  for (const [key, v] of Object.entries(raw)) {
    if (key.startsWith("repos.") && !key.slice("repos.".length).includes(".")) {
      out.push({ file, key, severity: "error", message: `"${key}" must be inside a [repos.<name>] table` });
      continue;
    }
    if (key.startsWith("repos.")) {
      const rest = key.slice("repos.".length);
      const field = rest.slice(rest.lastIndexOf(".") + 1);
      const name = rest.slice(0, rest.lastIndexOf("."));
      if (!(REPO_KEYS as readonly string[]).includes(field)) {
        out.push({ file, key, severity: "error", message: `unknown key "${field}" in [repos.${name}]; valid keys: ${REPO_KEYS.join(", ")}` });
        continue;
      }
    }
    if (!isKnownKey(key)) {
      const hint = suggest(key);
      out.push({ file, key, severity: "warning", message: `unknown key "${key}"${hint ? `; did you mean "${hint}"?` : ""}` });
      continue;
    }
    for (const p of checkValue(key, v)) out.push({ file, key, ...p });
  }
  return out;
}

function nameOf(key: string, prefix: string): string | undefined {
  if (!key.startsWith(prefix)) return undefined;
  const rest = key.slice(prefix.length);
  const i = rest.lastIndexOf(".");
  return i > 0 ? rest.slice(0, i) : undefined;
}

/** Cross-file rules over files in merge order (user first, repo last; later wins). Problems name the file holding the offending key. */
export function checkMerged(files: ConfigFile[]): ConfigProblem[] {
  const out: ConfigProblem[] = [];
  const lastWith = (pred: (k: string) => boolean): ConfigFile | undefined => [...files].reverse().find((f) => Object.keys(f.raw).some(pred));
  const merged: Record<string, Value> = {};
  for (const f of files) Object.assign(merged, f.raw);

  const profiles = new Set<string>();
  for (const f of files) for (const k of Object.keys(f.raw)) {
    const n = nameOf(k, "apply.agents.");
    if (n !== undefined) profiles.add(n);
  }
  for (const name of profiles) {
    const p = `apply.agents.${name}.`;
    if (!nonEmpty(merged[`${p}harness`]) && !nonEmpty(merged[`${p}command`])) {
      const f = lastWith((k) => k.startsWith(p));
      out.push({ file: f?.file ?? "", key: `${p}harness`, severity: "error", message: `agent profile "${name}" needs harness or command` });
    }
  }
  for (const f of files) {
    for (const [k, v] of Object.entries(f.raw)) {
      if (!/^apply\.tiers\.[^.]+$/.test(k) || !nonEmpty(v)) continue;
      const tier = k.slice("apply.tiers.".length);
      if (!(TIERS as readonly string[]).includes(tier)) continue;
      if (merged[k] !== v) continue; // overridden by a later file; report there
      if (!profiles.has(v.trim())) out.push({ file: f.file, key: k, severity: "error", message: `tier "${tier}" maps to undefined profile "${v.trim()}"` });
    }
  }
  const repos = new Set<string>();
  for (const f of files) for (const k of Object.keys(f.raw)) {
    const n = nameOf(k, "repos.");
    if (n !== undefined) repos.add(n);
  }
  for (const name of repos) {
    if (merged[`repos.${name}.path`] === undefined) {
      const f = lastWith((k) => k.startsWith(`repos.${name}.`));
      out.push({ file: f?.file ?? "", key: `repos.${name}.path`, severity: "error", message: `[repos.${name}] needs path` });
    }
  }
  return out;
}

/** Parse then check; a TOML syntax error becomes a single error problem for the file. */
export function checkText(file: string, text: string): { raw?: Record<string, Value>; problems: ConfigProblem[] } {
  try {
    const raw = parseToml(text, file);
    return { raw, problems: checkFile(file, raw) };
  } catch (e) {
    return { problems: [{ file, key: "", severity: "error", message: e instanceof Error ? e.message : String(e) }] };
  }
}
