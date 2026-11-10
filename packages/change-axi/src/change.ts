import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { loadConfig, type DocsConfig } from "docs-axi/lib/config";
import { listTasks, runTasks } from "./tasks.js";
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

export type ChangeState = "active" | "archived" | "backlog";
export interface ResolvedChange {
  slug: string;
  state: ChangeState;
  /** Absolute dir (undefined for backlog-only). */
  dir?: string;
  /** Repo-relative dir with `/` (undefined for backlog-only). */
  rel?: string;
  /** Backlog task kind (backlog-only results). */
  kind?: string;
}

export interface BacklogItemInfo {
  slug: string;
  kind: string;
  state: string;
  title: string;
  body: string;
  priority: string | undefined;
  repo: string | undefined;
  /** Active blockers. */
  blockedBy: string[];
}

/** One backlog.md task via `tasks-axi show`, or undefined when absent or the file is missing. */
export function getBacklogItem(ctx: Ctx, slug: string): BacklogItemInfo | undefined {
  if (!existsSync(join(ctx.root, "backlog.md"))) return undefined;
  let out: string;
  try {
    out = runTasks(ctx.root, ["show", slug, "--file", "backlog.md"]);
  } catch {
    return undefined;
  }
  const f: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const m = /^ {2}([a-z_]+): (.*)$/.exec(line);
    if (!m) continue;
    let v = m[2] as string;
    if (v.startsWith('"')) {
      try {
        v = JSON.parse(v) as string;
      } catch {
        /* keep raw */
      }
    }
    f[m[1] as string] = v;
  }
  if (f["id"] !== slug) return undefined;
  const dash = (v: string | undefined): string | undefined => (v === undefined || v === "-" || v === "" ? undefined : v);
  const bb = f["blocked_by"] ?? "none";
  return {
    slug,
    kind: f["kind"] ?? "",
    state: f["state"] ?? "",
    title: f["title"] ?? "",
    body: f["body"] ?? "",
    priority: dash(f["priority"]),
    repo: dash(f["repo"]),
    blockedBy: bb === "none" || bb === "" ? [] : bb.split(","),
  };
}

/** Resolve a change slug: active first, then archived/<date>-<slug>, then backlog-only. */
export function resolveChange(ctx: Ctx, slug: string): ResolvedChange | undefined {
  if (existsSync(changeDir(ctx, slug))) return { slug, state: "active", dir: changeDir(ctx, slug), rel: `specs/changes/active/${slug}` };
  if (existsSync(archivedDir(ctx))) {
    const hit = readdirSync(archivedDir(ctx))
      .filter((d) => /^\d{4}-\d{2}-\d{2}-/.test(d) && d.slice(11) === slug)
      .sort()
      .pop();
    if (hit) return { slug, state: "archived", dir: join(archivedDir(ctx), hit), rel: `specs/changes/archived/${hit}` };
  }
  const item = getBacklogItem(ctx, slug);
  if (item) return { slug, state: "backlog", kind: item.kind };
  return undefined;
}

/** Task ids in backlog.md (one per change). Empty when the file is missing. */
export function backlogSlugs(ctx: Ctx): Set<string> {
  const path = join(ctx.root, "backlog.md");
  if (!existsSync(path)) return new Set();
  try {
    return new Set(listTasks(ctx.root, "backlog.md").map((t) => t.id));
  } catch {
    return new Set();
  }
}

/** Read-only lookup: active or archived change dir. Backlog-only has no files. */
export function requireReadable(ctx: Ctx, slug: string): ResolvedChange & { dir: string; rel: string } {
  const r = resolveChange(ctx, slug);
  if (r?.dir && r.rel) return r as ResolvedChange & { dir: string; rel: string };
  if (r) throw new AxiError(`change "${slug}" is only in backlog.md (no plan files yet)`, "NOT_FOUND", [`Run \`change-axi where ${slug}\``]);
  requireChange(ctx, slug);
  throw new AxiError(`change "${slug}" not found`, "NOT_FOUND");
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

export interface RepoRef {
  name: string;
  /** Base branch from `name@base`; undefined means the repo default branch. */
  base?: string;
}

/** Entries of the proposal `Repos:` header (`name@base, name`). Empty when absent. */
export function parseRepos(proposalText: string): RepoRef[] {
  const out: RepoRef[] = [];
  for (const item of splitList(headerLine(proposalText, "Repos"))) {
    const at = item.indexOf("@");
    const name = (at < 0 ? item : item.slice(0, at)).trim();
    const base = at < 0 ? "" : item.slice(at + 1).trim();
    if (name !== "") out.push({ name, ...(base !== "" ? { base } : {}) });
  }
  return out;
}

/** Split an Owns entry `<repo>:<path>`; repo is undefined for plain paths (plan repo). One-letter prefixes are drive letters. */
export function splitOwnsRepo(entry: string): { repo?: string; path: string } {
  const m = /^([A-Za-z0-9][A-Za-z0-9_-]+):(?![\\/]{2})(.*)$/.exec(entry);
  return m ? { repo: m[1] as string, path: m[2] as string } : { path: entry };
}
