import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { AxiError } from "axi-sdk-js";
import { cmp, readText, toPosix } from "./fsutil.js";
import { parseDoc, type ParsedDoc } from "./frontmatter.js";

export const SECTIONS = ["domain", "architecture", "decisions"] as const;
export type Section = (typeof SECTIONS)[number];

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
}

export interface Doc {
  /** Posix path relative to docs dir, e.g. `domain/billing.md`. */
  path: string;
  section: Section;
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

function walk(dir: string, rel: string, out: string[]): void {
  const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort(
    (a, b) => cmp(a.name, b.name),
  );
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) walk(dir, next, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(next);
  }
}

export function loadDoc(ctx: Ctx, path: string): Doc {
  const section = path.split("/")[0] as string;
  if (!isSection(section)) {
    throw new AxiError(`Not in a docs section: ${path}`, "VALIDATION_ERROR", [
      `Sections: ${SECTIONS.join(", ")}`,
    ]);
  }
  const parsed = parseDoc(readText(join(ctx.docsDir, path)));
  const file = path.slice(path.lastIndexOf("/") + 1);
  const slug = file.replace(/\.md$/i, "");
  const tagsRaw = parsed.data["tags"];
  const adr = section === "decisions" ? ADR_FILE_RE.exec(file) : null;
  return {
    path,
    section,
    slug,
    parsed,
    title: str(parsed.data["title"]),
    summary: str(parsed.data["summary"]),
    tags: Array.isArray(tagsRaw) ? tagsRaw : [],
    status: str(parsed.data["status"]),
    supersedes: toList(parsed.data["supersedes"]),
    supersededBy: str(parsed.data["superseded-by"]),
    adrNumber: adr ? Number(adr[1]) : undefined,
  };
}

/** All managed docs, sorted by path. Files outside sections are not included. */
export function loadDocs(ctx: Ctx): Doc[] {
  const docs: Doc[] = [];
  for (const section of SECTIONS) {
    const dir = join(ctx.docsDir, section);
    if (!existsSync(dir)) continue;
    const files: string[] = [];
    walk(dir, "", files);
    for (const f of files) docs.push(loadDoc(ctx, `${section}/${f}`));
  }
  return docs.sort((a, b) => cmp(a.path, b.path));
}

/** `.md` files at the docs root (other than README.md) and unknown top-level dirs. */
export function findUnmanaged(ctx: Ctx): string[] {
  if (!existsSync(ctx.docsDir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(ctx.docsDir, { withFileTypes: true }).sort(
    (a, b) => cmp(a.name, b.name),
  )) {
    if (e.name.startsWith(".")) continue;
    if (e.isDirectory()) {
      if (!isSection(e.name)) out.push(`${e.name}/`);
    } else if (
      e.name.toLowerCase().endsWith(".md") &&
      e.name.toLowerCase() !== "readme.md"
    ) {
      out.push(e.name);
    }
  }
  return out;
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
