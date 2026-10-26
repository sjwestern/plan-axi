import { readFileSync } from "node:fs";
import { writeText } from "./fsutil.js";

export function quote(value: string): string {
  return JSON.stringify(value);
}

function commentIndex(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\" && quoted) i++;
    else if (line[i] === '"') quoted = !quoted;
    else if (line[i] === "#" && !quoted) return i;
  }
  return -1;
}

export function upsertKey(lines: string[], table: string, key: string, value: string): void {
  const header = `[${table}]`;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === header) {
      start = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[j]!)) {
          end = j;
          break;
        }
      }
      break;
    }
  }
  const assignment = new RegExp(`^(\\s*)${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=`);
  if (start >= 0) {
    for (let i = start + 1; i < end; i++) {
      const line = lines[i]!;
      const match = assignment.exec(line);
      if (!match) continue;
      const comment = commentIndex(line);
      const suffix = comment < 0 ? "" : ` ${line.slice(comment).trimStart()}`;
      lines[i] = `${match[1]}${key} = ${value}${suffix}`;
      return;
    }
    lines.splice(end, 0, `${key} = ${value}`);
    return;
  }
  if (lines.length > 0 && lines[lines.length - 1]!.trim() !== "") lines.push("");
  lines.push(header, `${key} = ${value}`);
}

function tableBounds(lines: string[], table: string): { start: number; end: number } | undefined {
  const header = `[${table}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start < 0) return undefined;
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[j]!)) {
      end = j;
      break;
    }
  }
  return { start, end };
}

export function removeKey(lines: string[], table: string, key: string): boolean {
  const bounds = tableBounds(lines, table);
  if (!bounds) return false;
  const assignment = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*=`);
  for (let i = bounds.start + 1; i < bounds.end; i++) {
    if (assignment.test(lines[i]!)) {
      lines.splice(i, 1);
      return true;
    }
  }
  return false;
}

export function removeTable(lines: string[], table: string): boolean {
  const bounds = tableBounds(lines, table);
  if (!bounds) return false;
  lines.splice(bounds.start, bounds.end - bounds.start);
  return true;
}

/** Reads path (ENOENT = empty), applies edit to its lines, validates the result, then writes. */
export function applyTomlEdit(
  path: string,
  edit: (lines: string[]) => string[] | void,
  validate: (candidate: string) => void,
): void {
  let original = "";
  try {
    original = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = original.replace(/\r\n/g, "\n").split("\n");
  const edited = edit(lines) ?? lines;
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const candidate = edited.join(eol);
  validate(candidate);
  writeText(path, candidate);
}
