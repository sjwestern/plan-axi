import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { applyEol, detectEol, normalizeEol, writeText } from "docs-axi/lib/fsutil";

export const START_MARK = "<!-- plan-axi:start -->";
export const END_MARK = "<!-- plan-axi:end -->";

export const SETUP_BLOCK = `${START_MARK}
## plan-axi

- On a branch matching \`specs/changes/active/<slug>\`, use the plan-apply skill (Execute mode). Run \`change-axi\` with no args for the change status and next step.
- Use \`change-axi\` and \`tasks-axi\` for plan files. Never hand-edit \`tasks.md\` or \`backlog.md\`.
${END_MARK}`;

const TARGETS = ["AGENTS.md", "CLAUDE.md"];

/** Explicit file, else existing AGENTS.md, else existing CLAUDE.md, else AGENTS.md (to create). */
export function setupTarget(root: string, file?: string): string {
  if (file) return isAbsolute(file) ? file : resolve(root, file);
  const hit = TARGETS.find((t) => existsSync(join(root, t)));
  return join(root, hit ?? "AGENTS.md");
}

const hasBlock = (text: string): boolean => text.includes(START_MARK) && text.indexOf(END_MARK) > text.indexOf(START_MARK);

/** True when any default target file already carries the managed block. */
export function hasSetupBlock(root: string): boolean {
  return TARGETS.some((t) => existsSync(join(root, t)) && hasBlock(readFileSync(join(root, t), "utf8")));
}

export function applySetup(root: string, file?: string): { path: string; changed: boolean; created: boolean } {
  const path = setupTarget(root, file);
  const created = !existsSync(path);
  const raw = created ? "" : readFileSync(path, "utf8");
  if (hasBlock(raw)) return { path, changed: false, created: false };
  const eol = created ? "\n" : detectEol(raw);
  const text = normalizeEol(raw);
  const sep = text === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  writeText(path, applyEol(`${text}${sep}${SETUP_BLOCK}\n`, eol));
  return { path, changed: true, created };
}

export function removeSetup(root: string, file?: string): { path: string; changed: boolean } {
  const path = setupTarget(root, file);
  if (!existsSync(path)) return { path, changed: false };
  const raw = readFileSync(path, "utf8");
  if (!hasBlock(raw)) return { path, changed: false };
  const eol = detectEol(raw);
  const text = normalizeEol(raw);
  const s = text.indexOf(START_MARK);
  let e = text.indexOf(END_MARK, s) + END_MARK.length;
  if (text[e] === "\n") e++;
  let before = text.slice(0, s);
  if (before.endsWith("\n\n")) before = before.slice(0, -1);
  const out = before + text.slice(e);
  if (out.trim() === "") rmSync(path);
  else writeText(path, applyEol(out, eol));
  return { path, changed: true };
}
