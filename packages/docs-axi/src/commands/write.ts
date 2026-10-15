import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import {
  flagStr,
  parseArgs,
  requireSingleLine,
  type CmdSpec,
  type Parsed,
} from "../args.js";
import { normalizeEol, readText, toPosix, writeText } from "../fsutil.js";
import { renderNewDoc, setFrontmatter, parseDoc, type FmValue } from "../frontmatter.js";
import { writeIndex } from "../indexgen.js";
import {
  ADR_STATUSES,
  MAX_SLUG,
  MAX_SUMMARY,
  SECTIONS,
  SLUG_RE,
  TAG_RE,
  isSection,
  loadDocs,
  nextAdrNumber,
  requireDocsDir,
  resolveDocPath,
  slugify,
  type Ctx,
  docsRel,
  type Section,
} from "../model.js";
import { adrBody, docBody } from "../templates.js";

function reindex(ctx: Ctx): "updated" | "unchanged" {
  return writeIndex(ctx, loadDocs(ctx)) ? "updated" : "unchanged";
}

function parseTags(raw: string): string[] {
  const tags: string[] = [];
  for (const t of raw.split(",").map((s) => s.trim()).filter((s) => s !== "")) {
    if (!TAG_RE.test(t)) {
      throw new AxiError(`invalid tag "${t}"`, "VALIDATION_ERROR", [
        "Tags are lowercase letters, digits and dashes, e.g. billing, auth-flow",
      ]);
    }
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}

function checkSummary(raw: string): string {
  const s = requireSingleLine("--summary", raw);
  if (s.length > MAX_SUMMARY) {
    throw new AxiError(`--summary is ${s.length} chars (max ${MAX_SUMMARY})`, "VALIDATION_ERROR", [
      "Keep it to one line: what the doc covers and when to read it",
    ]);
  }
  return s;
}

function checkStatus(raw: string): string {
  if (!(ADR_STATUSES as readonly string[]).includes(raw)) {
    throw new AxiError(`invalid status "${raw}"`, "VALIDATION_ERROR", [
      `Statuses: ${ADR_STATUSES.join(", ")}`,
    ]);
  }
  return raw;
}

// ---------------------------------------------------------------- init

export const INIT_SPEC: CmdSpec = {
  name: "init",
  flags: {},
  min: 0,
  max: 0,
  usage: "docs-axi init",
  help: `usage: docs-axi init
Scaffold docs/domain, docs/architecture, docs/decisions and docs/README.md
(with the generated index). Idempotent: existing files are left alone.
`,
};

export function initCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(INIT_SPEC, args);
  const created: string[] = [];
  for (const s of SECTIONS) {
    const dir = join(ctx.docsDir, s);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      writeText(join(dir, ".gitkeep"), "");
      created.push(`${s}/`);
    }
  }
  const readmeExisted = existsSync(join(ctx.docsDir, "README.md"));
  const changed = writeIndex(ctx, loadDocs(ctx));
  if (!readmeExisted) created.push("README.md");
  if (created.length === 0 && !changed) {
    return { init: "docs already scaffolded (no-op)" };
  }
  return {
    init: `created ${created.length} item(s) in ${docsRel(ctx)}`,
    created,
    help: [
      'Run `docs-axi new domain "<title>" --summary "<one line>"` to add a doc',
      'Run `docs-axi adr "<title>" --summary "<one line>"` to record a decision',
    ],
  };
}

// ---------------------------------------------------------------- new / adr

const NEW_FLAGS = {
  "--summary": "string",
  "--slug": "string",
  "--tags": "string",
  "--body-file": "string",
} as const;

export const NEW_SPEC: CmdSpec = {
  name: "new",
  flags: { ...NEW_FLAGS, "--status": "string" },
  min: 2,
  max: 2,
  usage: 'docs-axi new <section> "<title>" --summary "<one line>" [--slug <s>] [--tags a,b] [--body-file <path>]',
  help: `usage: docs-axi new <section> "<title>" --summary "<one line>" [flags]
Create a doc from a template and regenerate the index.
section: domain | architecture | decisions (decisions get the next ADR number)
flags:
  --summary <text>    required, one line, max ${MAX_SUMMARY} chars: what it covers and when to read it
  --slug <s>          file slug (default: derived from title, max ${MAX_SLUG} chars, a-z0-9 and dashes)
  --tags a,b          lowercase tags
  --body-file <path>  use this file as the body instead of the template (no frontmatter)
  --status <s>        decisions only: proposed (default) | accepted | superseded | deprecated
examples:
  docs-axi new domain "Billing rules" --summary "Invoice, proration and refund rules" --tags billing
  docs-axi new architecture "Job queue" --summary "How background jobs are scheduled and retried"
`,
};

export const ADR_SPEC: CmdSpec = {
  name: "adr",
  flags: { ...NEW_FLAGS, "--status": "string" },
  min: 1,
  max: 1,
  usage: 'docs-axi adr "<title>" --summary "<one line>" [--slug <s>] [--tags a,b] [--status <s>]',
  help: `usage: docs-axi adr "<title>" --summary "<one line>" [flags]
Alias for \`docs-axi new decisions\`. Picks the next ADR number (NNNN-slug.md),
status proposed. Same flags as \`new\`.
examples:
  docs-axi adr "Use Postgres for the job queue" --summary "Why jobs live in Postgres, not Redis"
`,
};

function createDoc(ctx: Ctx, section: string, titleRaw: string, p: Parsed): AxiStructuredOutput {
  if (!isSection(section)) {
    throw new AxiError(`unknown section ${section}`, "VALIDATION_ERROR", [
      `Sections: ${SECTIONS.join(", ")}`,
    ]);
  }
  requireDocsDir(ctx);
  const title = requireSingleLine("title", titleRaw);
  const summaryRaw = flagStr(p, "--summary");
  if (summaryRaw === undefined) {
    throw new AxiError("--summary is required", "VALIDATION_ERROR", [
      `docs-axi ${section === "decisions" ? "adr" : `new ${section}`} "${title}" --summary "<one line>"`,
    ]);
  }
  const summary = checkSummary(summaryRaw);
  const slug = flagStr(p, "--slug") ?? slugify(title);
  if (slug === "" || !SLUG_RE.test(slug) || slug.length > MAX_SLUG) {
    throw new AxiError(`invalid slug "${slug}"`, "VALIDATION_ERROR", [
      `Pass --slug with a-z, 0-9 and dashes, max ${MAX_SLUG} chars`,
    ]);
  }
  const tagsRaw = flagStr(p, "--tags");
  const tags = tagsRaw === undefined ? [] : parseTags(tagsRaw);
  const statusRaw = flagStr(p, "--status");
  if (statusRaw !== undefined && section !== "decisions") {
    throw new AxiError("--status applies to decisions only", "VALIDATION_ERROR");
  }
  const status = section === "decisions" ? checkStatus(statusRaw ?? "proposed") : undefined;

  const docs = loadDocs(ctx);
  const num = section === "decisions" ? nextAdrNumber(docs) : undefined;
  const file = num === undefined ? `${slug}.md` : `${String(num).padStart(4, "0")}-${slug}.md`;
  const path = `${section}/${file}`;
  const clash = docs.find((d) => d.path.toLowerCase() === path.toLowerCase());
  if (clash) {
    return { created: `${clash.path} already exists (no-op)`, help: [`Run \`docs-axi show ${clash.path}\``] };
  }
  let body = section === "decisions" ? adrBody(title) : docBody(title);
  const bodyFile = flagStr(p, "--body-file");
  if (bodyFile !== undefined) {
    if (!existsSync(bodyFile)) {
      throw new AxiError(`--body-file not found: ${bodyFile}`, "NOT_FOUND");
    }
    const text = normalizeEol(readText(bodyFile));
    if (parseDoc(text).hasFrontmatter) {
      throw new AxiError("--body-file must not contain frontmatter", "VALIDATION_ERROR", [
        "Pass the body only; docs-axi writes the frontmatter",
      ]);
    }
    body = text;
  }
  const fields: Record<string, FmValue | undefined> = {
    title,
    summary,
    status,
    tags: tags.length > 0 ? tags : undefined,
  };
  writeText(join(ctx.docsDir, path), renderNewDoc(fields, body));
  const idx = reindex(ctx);
  return {
    created: path,
    index: idx,
    help: [`Edit docs/${path} to write the content`, "Run `docs-axi check` before committing"],
  };
}

export function newCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(NEW_SPEC, args);
  return createDoc(ctx, p.pos[0] as string, p.pos[1] as string, p);
}

export function adrCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(ADR_SPEC, args);
  return createDoc(ctx, "decisions", p.pos[0] as string, p);
}

// ---------------------------------------------------------------- update

export const UPDATE_SPEC: CmdSpec = {
  name: "update",
  flags: {
    "--title": "string",
    "--summary": "string",
    "--tags": "string",
    "--status": "string",
  },
  min: 1,
  max: 1,
  usage: "docs-axi update <path|adr-number> [--title <t>] [--summary <s>] [--tags a,b] [--status <s>]",
  help: `usage: docs-axi update <path|adr-number> [flags]
Edit frontmatter only (the body is yours to edit directly) and regenerate the index.
Idempotent: unchanged values report a no-op.
flags:
  --title <t>      new title
  --summary <s>    new one-line summary (max ${MAX_SUMMARY} chars)
  --tags a,b       replace tags; pass --tags= to clear
  --status <s>     decisions only: proposed | accepted | superseded | deprecated
examples:
  docs-axi update 7 --status accepted
  docs-axi update domain/billing --summary "Invoice, proration, refund and tax rules"
`,
};

export function updateCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(UPDATE_SPEC, args);
  requireDocsDir(ctx);
  const changes: Record<string, FmValue | undefined> = {};
  const title = flagStr(p, "--title");
  const summary = flagStr(p, "--summary");
  const tags = flagStr(p, "--tags");
  const status = flagStr(p, "--status");
  if (title !== undefined) changes["title"] = requireSingleLine("--title", title);
  if (summary !== undefined) changes["summary"] = checkSummary(summary);
  if (tags !== undefined) {
    const list = parseTags(tags);
    changes["tags"] = list.length > 0 ? list : undefined;
  }
  if (Object.keys(changes).length === 0 && status === undefined) {
    throw new AxiError("nothing to update", "VALIDATION_ERROR", [`usage: ${UPDATE_SPEC.usage}`]);
  }
  const docs = loadDocs(ctx);
  const d = resolveDocPath(ctx, p.pos[0] as string, docs);
  if (status !== undefined) {
    if (d.section !== "decisions") {
      throw new AxiError("--status applies to decisions only", "VALIDATION_ERROR");
    }
    changes["status"] = checkStatus(status);
  }
  const abs = join(ctx.docsDir, d.path);
  const before = readText(abs);
  const after = setFrontmatter(before, changes);
  if (after === before) {
    return { update: `${d.path} already up to date (no-op)` };
  }
  writeText(abs, after);
  return {
    update: `${d.path} frontmatter updated`,
    fields: Object.keys(changes).concat(status !== undefined && !("status" in changes) ? ["status"] : []),
    index: reindex(ctx),
  };
}

// ---------------------------------------------------------------- supersede

export const SUPERSEDE_SPEC: CmdSpec = {
  name: "supersede",
  flags: { "--by": "string" },
  min: 1,
  max: 1,
  usage: "docs-axi supersede <old-adr> --by <new-adr>",
  help: `usage: docs-axi supersede <old-adr> --by <new-adr>
Mark an ADR superseded by a newer one and link both directions:
old gets status: superseded and superseded-by; new gets supersedes. Idempotent.
Accepts ADR numbers or paths.
example:
  docs-axi supersede 3 --by 9
`,
};

export function supersedeCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SUPERSEDE_SPEC, args);
  requireDocsDir(ctx);
  const byRaw = flagStr(p, "--by");
  if (byRaw === undefined) {
    throw new AxiError("--by is required", "VALIDATION_ERROR", [`usage: ${SUPERSEDE_SPEC.usage}`]);
  }
  const docs = loadDocs(ctx);
  const oldDoc = resolveDocPath(ctx, p.pos[0] as string, docs);
  const newDoc = resolveDocPath(ctx, byRaw, docs);
  for (const d of [oldDoc, newDoc]) {
    if (d.adrNumber === undefined) {
      throw new AxiError(`${d.path} is not an ADR`, "VALIDATION_ERROR", [
        "Only files named decisions/NNNN-slug.md can supersede or be superseded",
      ]);
    }
  }
  if (oldDoc.path === newDoc.path) {
    throw new AxiError("an ADR cannot supersede itself", "VALIDATION_ERROR");
  }
  const oldNum = String(oldDoc.adrNumber).padStart(4, "0");
  const newNum = String(newDoc.adrNumber).padStart(4, "0");
  if (oldDoc.supersededBy !== undefined && oldDoc.supersededBy !== newNum) {
    throw new AxiError(
      `ADR ${oldNum} is already superseded by ${oldDoc.supersededBy}`,
      "CONFLICT",
      [`Supersede ${oldDoc.supersededBy} instead, or fix the frontmatter by hand`],
    );
  }
  const supersedes = newDoc.supersedes.includes(oldNum)
    ? newDoc.supersedes
    : [...newDoc.supersedes, oldNum].sort();
  const oldPath = join(ctx.docsDir, oldDoc.path);
  const newPath = join(ctx.docsDir, newDoc.path);
  const oldBefore = readText(oldPath);
  const newBefore = readText(newPath);
  const oldAfter = setFrontmatter(oldBefore, { status: "superseded", "superseded-by": newNum });
  const newAfter = setFrontmatter(newBefore, {
    supersedes: supersedes.length === 1 ? supersedes[0] : supersedes,
  });
  if (oldAfter === oldBefore && newAfter === newBefore) {
    return { supersede: `ADR ${oldNum} already superseded by ${newNum} (no-op)` };
  }
  writeText(oldPath, oldAfter);
  writeText(newPath, newAfter);
  return {
    supersede: `ADR ${oldNum} superseded by ${newNum}`,
    index: reindex(ctx),
  };
}

// ---------------------------------------------------------------- index

export const INDEX_SPEC: CmdSpec = {
  name: "index",
  flags: {},
  min: 0,
  max: 0,
  usage: "docs-axi index",
  help: `usage: docs-axi index
Regenerate the index block in docs/README.md from doc frontmatter.
Idempotent. Run after hand-editing frontmatter or resolving a merge conflict in README.md.
`,
};

export function indexCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(INDEX_SPEC, args);
  requireDocsDir(ctx);
  const docs = loadDocs(ctx);
  return writeIndex(ctx, docs)
    ? { index: `updated (${docs.length} docs)` }
    : { index: "up to date (no-op)" };
}
