import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve, sep } from "node:path";

/** Locale-independent, byte-stable comparison (UTF-16 code units). */
export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Always `/`, so output is identical on Windows, Linux and macOS. */
export function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

export type Eol = "\n" | "\r\n";

export function detectEol(text: string): Eol {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function applyEol(text: string, eol: Eol): string {
  return eol === "\n" ? text : text.replace(/\n/g, "\r\n");
}

export function readText(path: string): string {
  const text = readFileSync(path, "utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Write via temp file + rename so a crash never leaves a half-written doc. */
export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, content, "utf8");
  renameSync(tmp, path);
}

/** Nearest ancestor containing `.git` (dir or file, so worktrees work). */
export function findRepoRoot(cwd: string): string {
  let dir = resolve(cwd);
  const { root } = parse(dir);
  for (;;) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    if (dir === root) return resolve(cwd);
    dir = dirname(dir);
  }
}
