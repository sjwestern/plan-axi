import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { loadConfig, type DocsConfig } from "docs-axi/lib/config";
import { readText, normalizeEol } from "docs-axi/lib/fsutil";

export interface Ctx {
  root: string;
  docsConfig?: DocsConfig;
}

export function getDocsConfig(ctx: Ctx): DocsConfig {
  return ctx.docsConfig ?? loadConfig(ctx.root);
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SLUG = 50;
export const TOOL_DIRS = [".agents", ".pi", ".claude", ".cursor", ".codex", ".gemini", ".opencode"];

export const activeDir = (ctx: Ctx): string => join(ctx.root, "specs", "changes", "active");
export const archivedDir = (ctx: Ctx): string => join(ctx.root, "specs", "changes", "archived");
export const changeDir = (ctx: Ctx, slug: string): string => join(activeDir(ctx), slug);
/** Path relative to the repo root with `/`, for tasks-axi `--file` (run from the root). */
export const tasksRel = (slug: string): string => `specs/changes/active/${slug}/tasks.md`;

export function checkSlug(slug: string): void {
  if (!SLUG_RE.test(slug) || slug.length > MAX_SLUG) {
    throw new AxiError(`bad slug "${slug}"`, "VALIDATION_ERROR", [
      `Use kebab-case (a-z, 0-9, dashes), verb first, max ${MAX_SLUG} chars`,
    ]);
  }
}

export function requireChange(ctx: Ctx, slug: string): string {
  const dir = changeDir(ctx, slug);
  if (!existsSync(dir)) {
    const known = existsSync(activeDir(ctx)) ? readdirSync(activeDir(ctx)).sort() : [];
    throw new AxiError(`change "${slug}" not found in specs/changes/active/`, "NOT_FOUND", [
      known.length > 0 ? `Active changes: ${known.join(", ")}` : "No active changes. Create one with `change-axi new <slug> \"<title>\"`",
    ]);
  }
  return dir;
}

export function stepFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => /^\d{2,}-.+\.md$/.test(f)).sort();
}

/** `proposal`, `01`, `01-schema` or `01-schema.md` -> file name inside the change dir. */
export function resolveDoc(dir: string, which: string): string {
  if (which === "proposal" || which === "proposal.md") return "proposal.md";
  const steps = stepFiles(dir);
  const stem = which.replace(/\.md$/, "");
  const hit = steps.find((f) => f === `${stem}.md`) ?? steps.filter((f) => f.startsWith(`${stem}-`));
  if (typeof hit === "string") return hit;
  if (Array.isArray(hit) && hit.length === 1) return hit[0] as string;
  throw new AxiError(`no doc "${which}" in ${dir}`, "NOT_FOUND", [
    `Docs: proposal, ${steps.map((f) => f.replace(/\.md$/, "")).join(", ") || "(no steps yet)"}`,
  ]);
}

export function readLf(path: string): string {
  return normalizeEol(readText(path));
}

export function headerLine(text: string, key: string): string | undefined {
  const m = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(text);
  return m ? (m[1] as string).trim() : undefined;
}

export function splitList(v: string | undefined): string[] {
  if (v === undefined) return [];
  return v
    .split(",")
    .map((s) => s.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((s) => s !== "" && s.toLowerCase() !== "none");
}
