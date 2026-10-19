import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { loadConfig } from "./config.js";
import { writeText } from "./fsutil.js";

export interface LayoutChanges {
  dir?: string;
  sections?: string[];
  adr?: string | null;
  guides?: Array<{ name: string; guide: string }>;
}

function quote(value: string): string {
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

function upsertKey(lines: string[], table: string, key: string, value: string): void {
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

function pruneRemovedGuides(lines: string[], sections: Set<string>): string[] {
  let table = "";
  return lines.filter((line) => {
    const header = /^\s*\[([A-Za-z0-9_.-]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) table = header[1]!;
    const section = /^docs\.section\.([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(table);
    if (!section || sections.has(section[1]!)) return true;
    if (header) return false;
    if (/^\s*(?:guide)\s*=/.test(line)) return false;
    return true;
  });
}

function validateCandidate(text: string): void {
  const temp = mkdtempSync(join(tmpdir(), "docs-axi-config-"));
  try {
    writeFileSync(join(temp, ".plan-axi.toml"), text, "utf8");
    // loadConfig also merges the user's config, so validation matches runtime resolution.
    loadConfig(temp);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function writeLayoutConfig(root: string, changes: LayoutChanges): void {
  const path = join(root, ".plan-axi.toml");
  const original = (() => {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  })();
  let lines = original.replace(/\r\n/g, "\n").split("\n");
  const selectedSections = changes.sections;
  if (selectedSections) lines = pruneRemovedGuides(lines, new Set(selectedSections));
  if (changes.dir !== undefined) upsertKey(lines, "docs", "dir", quote(changes.dir));
  if (selectedSections !== undefined) upsertKey(lines, "docs", "sections", `[${selectedSections.map(quote).join(", ")}]`);
  if (changes.adr !== undefined) upsertKey(lines, "docs", "adr", changes.adr === null ? "false" : quote(changes.adr));
  for (const { name, guide } of changes.guides ?? []) {
    upsertKey(lines, `docs.section.${name}`, "guide", quote(guide));
  }
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const candidate = lines.join(eol);
  validateCandidate(candidate);
  writeText(path, candidate);
}

export function parseGuide(value: string): { name: string; guide: string } {
  const split = value.indexOf("=");
  if (split < 1) throw new AxiError(`invalid --guide ${value}; expected name="text"`, "VALIDATION_ERROR");
  const name = value.slice(0, split).trim();
  const raw = value.slice(split + 1).trim();
  let guide: string;
  try {
    guide = JSON.parse(raw) as string;
  } catch {
    if (raw.startsWith("'") && raw.endsWith("'")) guide = raw.slice(1, -1);
    else throw new AxiError(`invalid --guide ${value}; expected name="text"`, "VALIDATION_ERROR");
  }
  if (typeof guide !== "string" || guide.trim() === "") {
    throw new AxiError("--guide text must be non-empty", "VALIDATION_ERROR");
  }
  return { name, guide };
}
