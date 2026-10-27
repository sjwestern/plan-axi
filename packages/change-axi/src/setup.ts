import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { applyEol, detectEol, normalizeEol, writeText } from "docs-axi/lib/fsutil";

export const START_MARK = "<!-- plan-axi:start -->";
export const END_MARK = "<!-- plan-axi:end -->";

export const SETUP_BLOCK = `${START_MARK}
## plan-axi

- On a branch matching \`specs/changes/active/<slug>\`, use the plan-apply skill (Execute mode). Run \`change-axi\` with no args for the change status and next step.
- For any question about change, step, or backlog state (what's next, in progress, blocked, or whether changes can run together), run \`change-axi\` and \`tasks-axi list\` first. Never read \`tasks.md\` or \`backlog.md\` directly (cat, rg, read). Step state lives on each change's worktree branch, so \`main\` is stale for it: use \`change-axi status <slug>\` from the worktree. Read \`proposal.md\` and step files only for content (scope, Owns), not state.
- Capture unplanned work with \`change-axi idea "<one-liner>" [--kind idea|bug|chore] [--priority 0-4]\` and list it with \`change-axi backlog\`; turn an item into a plan with \`change-axi new <slug>\` (plan-propose).
- Use \`change-axi\` and \`tasks-axi\` for plan files. Never hand-edit \`tasks.md\` or \`backlog.md\`.
- To find docs, start at the index: run \`docs-axi\` (lists the docs index; \`docs-axi config\` shows the docs layout and where each kind of doc goes), then \`docs-axi search <terms>\` for a topic and \`docs-axi show <path> --section <name>\` to read only what you need. If \`docs-axi\` is unavailable, use \`rg <terms>\` in the docs dir (it covers the index and doc bodies) and read only the matching files. Don't \`rg\` just the index when \`docs-axi\` works, since it lists only titles and summaries.
- For exploration and planning tasks, look at the docs first (see above) so the idea fits existing docs and ADRs.
- Cite ADRs in full as \`ADR-NNNN-slug\` (bare \`ADR 7\` is an error). An existing repo runs \`docs-axi adr fix-refs\` once to rewrite bare refs; on a number clash run the printed \`docs-axi adr renumber\` command.
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
  const eol = created ? "\n" : detectEol(raw);
  const text = normalizeEol(raw);
  if (hasBlock(raw)) {
    const s = text.indexOf(START_MARK);
    const e = text.indexOf(END_MARK, s) + END_MARK.length;
    if (text.slice(s, e) === SETUP_BLOCK) return { path, changed: false, created: false };
    writeText(path, applyEol(text.slice(0, s) + SETUP_BLOCK + text.slice(e), eol));
    return { path, changed: true, created: false };
  }
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
