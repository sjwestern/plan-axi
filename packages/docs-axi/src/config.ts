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
export interface DocsConfig {
  ignore: string[];
  map: Record<string, string[]>;
  sources: string[];
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

export function loadConfig(root: string): DocsConfig {
  const cfg: DocsConfig = { ignore: [...DEFAULT_IGNORE], map: {}, sources: [] };
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
      }
    }
  }
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
