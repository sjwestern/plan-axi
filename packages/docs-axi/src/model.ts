import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AxiError } from "axi-sdk-js";
import { cmp, readText, toPosix } from "./fsutil.js";
import { parseDoc, type ParsedDoc } from "./frontmatter.js";
import { deriveTitleSummary } from "./derive.js";
import { matchesAny, type DocsConfig } from "./config.js";

export const SECTIONS = ["domain", "architecture", "decisions"] as const;
export type Section = (typeof SECTIONS)[number];

/** One-line meaning of each section: the single source for README intro, home, `new --help` and errors. */
export const SECTION_GUIDE: Record<Section, string> = {
  domain: "what the system is for: concepts, rules, behavior in user terms",
  architecture: "how it is built now: components, boundaries, conventions",
  decisions: "ADRs: why one choice was made, one decision per file, immutable once accepted",
};

/** `- domain: ...` lines for help text. */
export const sectionGuideLines = (prefix = "  "): string => SECTIONS.map((s) => `${prefix}${s} - ${SECTION_GUIDE[s]}`).join("\n");
/** `other` = docs outside the standard layout, indexed in place. */
export const OTHER = "other" as const;
export type DocSection = Section | typeof OTHER;
export const DOC_SECTIONS = [...SECTIONS, OTHER] as const;

export const ADR_STATUSES = [
  "proposed",
  "accepted",
  "superseded",
  "deprecated",
] as const;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const ADR_FILE_RE = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
export const MAX_SLUG = 60;
export const MAX_SUMMARY = 160;

export interface Ctx {
  root: string;
  docsDir: string;
  config: DocsConfig;
}

export interface Doc {
  /** Posix path relative to docs dir, e.g. `domain/billing.md`. */
  path: string;
  section: DocSection;
  /** File name without `.md`. */
  slug: string;
  parsed: ParsedDoc;
  title: string | undefined;
  summary: string | undefined;
  tags: string[];
  status: string | undefined;
  supersedes: string[];
  supersededBy: string | undefined;
  adrNumber: number | undefined;
  /** Placed in a section via config `[docs.map]` instead of living under it. */
  mapped: boolean;
}

export function isDocSection(s: string): s is DocSection {
  return (DOC_SECTIONS as readonly string[]).includes(s);
}

export function isSection(s: string): s is Section {
  return (SECTIONS as readonly string[]).includes(s);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x !== "");
  const s = str(v);
  return s === undefined ? [] : [s];
}

/** All non-ignored `.md` files under the docs dir (posix, relative), sorted. Dot-entries are always skipped. */
function walk(ctx: Ctx, rel: string, out: string[]): void {
  const entries = readdirSync(join(ctx.docsDir, rel), { withFileTypes: true }).sort(
    (a, b) => cmp(a.name, b.name),
  );
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (matchesAny(ctx.config.ignore, next)) continue;
    if (e.isDirectory()) walk(ctx, next, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      if (next.toLowerCase() === "readme.md") continue;
      out.push(next);
    }
  }
}

/**
 * Section for a docs-relative path: native folder first, then config map, else `other`
 * (indexed in place). Mapped = placed by config rather than by folder.
 */
export function sectionOf(ctx: Ctx, path: string): { section: DocSection; mapped: boolean } {
  const first = path.split("/")[0] as string;
  if (path.includes("/") && isSection(first)) return { section: first, mapped: false };
  for (const [section, pats] of Object.entries(ctx.config.map)) {
    if (isDocSection(section) && matchesAny(pats, path)) {
      return { section, mapped: section !== OTHER };
    }
  }
  return { section: OTHER, mapped: false };
}

export function loadDoc(ctx: Ctx, path: string): Doc {
  const { section, mapped } = sectionOf(ctx, path);
  const parsed = parseDoc(readText(join(ctx.docsDir, path)));
  const file = path.slice(path.lastIndexOf("/") + 1);
  const slug = file.replace(/\.md$/i, "");
  const tagsRaw = parsed.data["tags"];
  const adr = section === "decisions" && !mapped ? ADR_FILE_RE.exec(file) : null;
  let title = str(parsed.data["title"]);
  let summary = str(parsed.data["summary"]);
  if (section === OTHER && (title === undefined || summary === undefined)) {
    // unmanaged doc: show something useful in the index without editing the file
    const d = deriveTitleSummary(parsed.body, slug);
    title ??= d.title;
    summary ??= d.needsSummary ? undefined : d.summary;
  }
  return {
    path,
    section,
    slug,
    parsed,
    title,
    summary,
    tags: Array.isArray(tagsRaw) ? tagsRaw : [],
    status: str(parsed.data["status"]),
    supersedes: toList(parsed.data["supersedes"]),
    supersededBy: str(parsed.data["superseded-by"]),
    adrNumber: adr ? Number(adr[1]) : undefined,
    mapped,
  };
}

export function allFiles(ctx: Ctx): string[] {
  if (!existsSync(ctx.docsDir)) return [];
  const files: string[] = [];
  walk(ctx, "", files);
  return files;
}

/** All managed docs (native sections plus config-mapped files), sorted by path. */
export function loadDocs(ctx: Ctx): Doc[] {
  const docs: Doc[] = [];
  for (const f of allFiles(ctx)) docs.push(loadDoc(ctx, f));
  return docs.sort((a, b) => cmp(a.path, b.path));
}

export function requireDocsDir(ctx: Ctx): void {
  if (!existsSync(ctx.docsDir)) {
    throw new AxiError(
      `No docs folder at ${docsRel(ctx)}`,
      "NOT_FOUND",
      ["Run `docs-axi init` to scaffold docs/domain, docs/architecture, docs/decisions"],
    );
  }
}

/**
 * Resolve user input to a doc path. Accepts `domain/foo`, `domain/foo.md`,
 * `docs/domain/foo.md`, or an ADR number (`7`, `0007`).
 */
export function resolveDocPath(ctx: Ctx, input: string, docs: Doc[]): Doc {
  let p = toPosix(input).replace(/^\.\//, "").replace(/^docs\//, "");
  if (/^\d{1,4}$/.test(p)) {
    const n = Number(p);
    const hits = docs.filter((d) => d.adrNumber === n);
    if (hits.length === 1) return hits[0]!;
    if (hits.length > 1) {
      throw new AxiError(
        `ADR number ${n} is used by ${hits.length} files`,
        "CONFLICT",
        ["Run `docs-axi check` to see duplicates", ...hits.map((h) => `Use the full path: ${h.path}`)],
      );
    }
    throw new AxiError(`No ADR numbered ${n}`, "NOT_FOUND", [
      "Run `docs-axi list decisions` to see ADRs",
    ]);
  }
  if (!p.toLowerCase().endsWith(".md")) p = `${p}.md`;
  const hit = docs.find((d) => d.path === p);
  if (hit) return hit;
  const ci = docs.find((d) => d.path.toLowerCase() === p.toLowerCase());
  if (ci) return ci;
  throw new AxiError(`No doc at ${p}`, "NOT_FOUND", [
    "Run `docs-axi list` to see docs, or `docs-axi search <terms>`",
  ]);
}

export function nextAdrNumber(docs: Doc[]): number {
  let max = 0;
  for (const d of docs) if (d.adrNumber !== undefined && d.adrNumber > max) max = d.adrNumber;
  return max + 1;
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= MAX_SLUG) return base;
  const cut = base.slice(0, MAX_SLUG);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : cut).replace(/-+$/, "");
}

export function displayTitle(d: Doc): string {
  return d.title ?? d.slug;
}

/** Docs dir relative to the repo root (posix), for stable output. */
export function docsRel(ctx: Ctx): string {
  const rel = toPosix(relative(ctx.root, ctx.docsDir));
  return rel === "" ? "." : rel;
}
