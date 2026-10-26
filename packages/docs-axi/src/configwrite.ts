import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { loadConfig } from "./config.js";
import { applyTomlEdit, quote, upsertKey } from "./tomlwrite.js";

export interface LayoutChanges {
  dir?: string;
  sections?: string[];
  adr?: string | null;
  guides?: Array<{ name: string; guide: string }>;
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
  applyTomlEdit(path, (lines) => {
  const selectedSections = changes.sections;
  if (selectedSections) lines = pruneRemovedGuides(lines, new Set(selectedSections));
  if (changes.dir !== undefined) upsertKey(lines, "docs", "dir", quote(changes.dir));
  if (selectedSections !== undefined) upsertKey(lines, "docs", "sections", `[${selectedSections.map(quote).join(", ")}]`);
  if (changes.adr !== undefined) upsertKey(lines, "docs", "adr", changes.adr === null ? "false" : quote(changes.adr));
  for (const { name, guide } of changes.guides ?? []) {
    upsertKey(lines, `docs.section.${name}`, "guide", quote(guide));
  }
  return lines;
  }, validateCandidate);
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
