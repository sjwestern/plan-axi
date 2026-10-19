import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";

/**
 * plan-axi config (TOML subset: [tables], key = "str" | ["a", "b"] | true/false, # comments).
 * Sources, merged (arrays are unioned):
 *   1. user:  $XDG_CONFIG_HOME/plan-axi/config.toml  (default ~/.config/plan-axi/config.toml)
 *   2. repo:  <repo root>/.plan-axi.toml
 *
 *   [docs]
 *   ignore = ["todo/", "reports/", "**\/*.draft.md"]   # relative to the docs folder
 *   [docs.map]                                          # index legacy files in place
 *   domain = ["domain.md", "features/"]
 */
export interface SectionDef {
  name: string;
  guide: string;
  kind: "doc" | "adr";
}

/** Resolved docs layout: docs folder, ordered sections, and which section (if any) holds ADRs. */
export interface Layout {
  dir: string;
  sections: SectionDef[];
  adr?: string;
}

export interface DocsConfig {
  ignore: string[];
  map: Record<string, string[]>;
  sources: string[];
  layout: Layout;
}

/** Built-in sections and one-line meanings; also the default layout. */
export const DEFAULT_GUIDES: Record<string, string> = {
  domain: "what the system is for: concepts, rules, behavior in user terms",
  architecture: "how it is built now: components, boundaries, conventions",
  decisions: "ADRs: why one choice was made, one decision per file, immutable once accepted",
};
export const DEFAULT_SECTIONS = ["domain", "architecture", "decisions"];
export const DEFAULT_ADR = "decisions";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function bad(path: string, msg: string): never {
  throw new AxiError(`${path}: ${msg}`, "VALIDATION_ERROR");
}

/** Top-level docs entries owned by other tools; never indexed or reported. Dot-entries are always skipped. */
export const DEFAULT_IGNORE = ["node_modules/", "_build/", "_site/", "site/", "dist/", "build/"];

export type Value = string | boolean | string[];

function stripComment(line: string): string {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "\\" && q) i++;
    else if (c === '"') q = !q;
    else if (c === "#" && !q) return line.slice(0, i);
  }
  return line;
}

function parseString(s: string, where: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      /* fall through */
    }
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  throw new AxiError(`${where}: expected a quoted string, got ${t}`, "VALIDATION_ERROR");
}

function parseValue(raw: string, where: string): Value {
  const t = raw.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t.startsWith("[")) {
    const inner = t.slice(1, t.lastIndexOf("]"));
    const items: string[] = [];
    let cur = "";
    let q = "";
    for (let i = 0; i < inner.length; i++) {
      const c = inner[i] as string;
      if (q) {
        cur += c;
        if (c === "\\" && q === '"') cur += inner[++i] ?? "";
        else if (c === q) q = "";
      } else if (c === '"' || c === "'") {
        q = c;
        cur += c;
      } else if (c === ",") {
        if (cur.trim() !== "") items.push(parseString(cur, where));
        cur = "";
      } else cur += c;
    }
    if (cur.trim() !== "") items.push(parseString(cur, where));
    return items;
  }
  return parseString(t, where);
}

/** Parse the TOML subset into a flat map keyed `table.key`. */
export function parseToml(text: string, where: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  let table = "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = stripComment(lines[i] as string).trim();
    if (line === "") continue;
    const h = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (h) {
      table = h[1] as string;
      continue;
    }
    const kv = /^([A-Za-z0-9_.-]+|"[^"]*")\s*=\s*(.*)$/.exec(line);
    if (!kv) throw new AxiError(`${where}:${i + 1}: cannot parse "${line}"`, "VALIDATION_ERROR");
    let val = kv[2] as string;
    if (val.trim().startsWith("[")) {
      while (!stripComment(val).trim().endsWith("]") && i + 1 < lines.length) {
        val += `\n${stripComment(lines[++i] as string)}`;
      }
      line = val;
    }
    const key = kv[1]!.replace(/^"|"$/g, "");
    out[table === "" ? key : `${table}.${key}`] = parseValue(val, `${where}:${i + 1}`);
  }
  return out;
}

function userConfigPath(): string {
  const base = process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  return join(base, "plan-axi", "config.toml");
}

function union(a: string[], b: string[]): string[] {
  return [...a, ...b.filter((x) => !a.includes(x))];
}

/** Build and validate the layout from the merged keys; `origin` maps a key to the file that set it. */
function resolveLayout(kv: Record<string, Value>, origin: Record<string, string>): Layout {
  const at = (k: string): string => origin[k] ?? "config";
  let dir = "docs";
  if ("docs.dir" in kv) {
    const v = kv["docs.dir"];
    if (typeof v !== "string" || v.trim() === "") bad(at("docs.dir"), "docs.dir must be a non-empty string");
    dir = (v as string).trim();
  }
  let names = DEFAULT_SECTIONS;
  if ("docs.sections" in kv) {
    const v = kv["docs.sections"];
    if (!Array.isArray(v) || v.length === 0) bad(at("docs.sections"), "docs.sections must be a non-empty array of names");
    names = v as string[];
  }
  const seen = new Set<string>();
  for (const n of names) {
    if (!NAME_RE.test(n)) bad(at("docs.sections"), `docs.sections: "${n}" is not a lowercase slug`);
    if (n === "other") bad(at("docs.sections"), 'docs.sections: "other" is reserved');
    if (seen.has(n)) bad(at("docs.sections"), `docs.sections: duplicate section "${n}"`);
    seen.add(n);
  }
  const guidePrefix = "docs.section.";
  for (const k of Object.keys(kv)) {
    if (!k.startsWith(guidePrefix)) continue;
    const m = /^docs\.section\.(.+)\.guide$/.exec(k);
    if (!m) bad(at(k), `unknown key ${k} (expected docs.section.<name>.guide)`);
    if (typeof kv[k] !== "string") bad(at(k), `${k} must be a string`);
    if (!seen.has(m![1] as string)) bad(at(k), `${k}: "${m![1]}" is not in docs.sections`);
  }
  let adr: string | undefined;
  if ("docs.adr" in kv) {
    const v = kv["docs.adr"];
    if (v === false) adr = undefined;
    else if (typeof v === "string") {
      if (!seen.has(v)) bad(at("docs.adr"), `docs.adr: "${v}" is not in docs.sections`);
      adr = v;
    } else bad(at("docs.adr"), "docs.adr must be a section name or false");
  } else if (seen.has(DEFAULT_ADR)) adr = DEFAULT_ADR;
  const sections: SectionDef[] = names.map((name) => {
    const g = kv[`${guidePrefix}${name}.guide`];
    const guide = typeof g === "string" && g.trim() !== "" ? g.trim() : DEFAULT_GUIDES[name];
    if (guide === undefined) {
      bad(at("docs.sections"), `section "${name}" needs a guide: set docs.section.${name}.guide`);
    }
    return { name, guide: guide as string, kind: name === adr ? "adr" : "doc" };
  });
  return adr === undefined ? { dir, sections } : { dir, sections, adr };
}

export function loadConfig(root: string): DocsConfig {
  const cfg: DocsConfig = { ignore: [...DEFAULT_IGNORE], map: {}, sources: [], layout: resolveLayout({}, {}) };
  const layoutKv: Record<string, Value> = {};
  const origin: Record<string, string> = {};
  for (const [label, path] of [
    ["user", userConfigPath()],
    ["repo", join(root, ".plan-axi.toml")],
  ] as const) {
    if (!existsSync(path)) continue;
    const kv = parseToml(readFileSync(path, "utf8"), path);
    cfg.sources.push(label);
    for (const [k, v] of Object.entries(kv)) {
      if (k === "docs.ignore") {
        if (!Array.isArray(v)) throw new AxiError(`${path}: docs.ignore must be an array`, "VALIDATION_ERROR");
        cfg.ignore = union(cfg.ignore, v);
      } else if (k.startsWith("docs.map.")) {
        if (!Array.isArray(v)) throw new AxiError(`${path}: ${k} must be an array`, "VALIDATION_ERROR");
        const section = k.slice("docs.map.".length);
        cfg.map[section] = union(cfg.map[section] ?? [], v);
      } else if (k === "docs.dir" || k === "docs.sections" || k === "docs.adr" || k.startsWith("docs.section.")) {
        layoutKv[k] = v; // repo overrides user
        origin[k] = path;
      }
    }
  }
  cfg.layout = resolveLayout(layoutKv, origin);
  return cfg;
}

/**
 * Raw merged config as a flat `table.key` map: user then repo; arrays unioned, scalars repo over user.
 * Docs behavior is unchanged (see loadConfig); other tools read their own tables from here.
 */
export function loadRawConfig(root: string): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const path of [userConfigPath(), join(root, ".plan-axi.toml")]) {
    if (!existsSync(path)) continue;
    for (const [k, v] of Object.entries(parseToml(readFileSync(path, "utf8"), path))) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? union(prev, v) : v;
    }
  }
  return out;
}

function toRegex(pattern: string): RegExp {
  let p = pattern.replace(/^\.?\//, "");
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  let re = "";
  for (let i = 0; i < p.length; i++) {
    const c = p[i] as string;
    if (c === "*") {
      if (p[i + 1] === "*") {
        i++;
        if (p[i + 1] === "/") i++;
        re += "(?:.*/)?";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // match the path itself or anything below it
  return new RegExp(`^${re}(?:/.*)?$`, "i");
}

/** Does `path` (posix, relative to docs dir) match any pattern (itself or an ancestor)? */
export function matchesAny(patterns: string[], path: string): boolean {
  return patterns.some((p) => toRegex(p).test(path));
}
