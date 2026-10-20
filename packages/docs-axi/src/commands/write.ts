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
import { readText, writeText } from "../fsutil.js";
import { renderNewDoc, setFrontmatter, parseDoc, type FmValue } from "../frontmatter.js";
import { writeIndex } from "../indexgen.js";
import {
  ADR_STATUSES,
  MAX_SLUG,
  MAX_SUMMARY,
  layoutGuideLines,
  sectionNames,
  isAdrSection,
  SLUG_RE,
  TAG_RE,
  isSectionIn,
  loadDocs,
  nextAdrNumber,
  requireDocsDir,
  resolveDocPath,
  slugify,
  type Ctx,
  docsRel,
} from "../model.js";
import { adrBody, docBody } from "../templates.js";
import { readBodyInput } from "../body.js";
import { editSection } from "../sectionedit.js";

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
Scaffold the configured docs sections and docs/README.md
(with the generated index). Idempotent: existing files are left alone.
`,
};

export function initCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(INIT_SPEC, args);
  const created: string[] = [];
  for (const s of sectionNames(ctx.config.layout)) {
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
      `Run \`docs-axi new <section> "<title>" --summary "<one line>"\` to add a doc. Sections:\n${layoutGuideLines(ctx.config.layout)}`,
      ...(ctx.config.layout.adr
        ? ['Run `docs-axi adr add "<title>" --summary "<one line>"` to record a decision']
        : []),
    ],
  };
}

// ---------------------------------------------------------------- new / adr

const NEW_FLAGS = {
  "--summary": "string",
  "--slug": "string",
  "--tags": "string",
  "--body-file": "string",
  "--body": "string",
} as const;

export const NEW_SPEC: CmdSpec = {
  name: "new",
  flags: { ...NEW_FLAGS, "--status": "string" },
  min: 2,
  max: 2,
  usage: 'docs-axi new <section> "<title>" --summary "<one line>" [--slug <s>] [--tags a,b] [--body <t> | --body-file <path|->]',
  help: `usage: docs-axi new <section> "<title>" --summary "<one line>" [flags]
Create a doc from a template and regenerate the index.
section: any configured section name (the ADR section gets the next ADR number)
flags:
  --summary <text>    required, one line, max ${MAX_SUMMARY} chars: what it covers and when to read it
  --slug <s>          file slug (default: derived from title, max ${MAX_SLUG} chars, a-z0-9 and dashes)
  --tags a,b          lowercase tags
  --body <t>          body text instead of the template (no frontmatter)
  --body-file <path>  body from a file, or - for stdin
  --status <s>        ADR section only: proposed (default) | accepted | superseded | deprecated
examples:
  docs-axi new <section> "Billing rules" --summary "Invoice, proration and refund rules" --tags billing
`,
};

export const ADR_SPEC: CmdSpec = {
  name: "adr add",
  flags: {
    ...NEW_FLAGS,
    "--status": "string",
    "--context": "string",
    "--decision": "string",
    "--consequences": "string",
  },
  min: 1,
  max: 1,
  usage: 'docs-axi adr add "<title>" --summary "<one line>" [--slug <s>] [--tags a,b] [--status <s>]',
  help: `usage: docs-axi adr add "<title>" --summary "<one line>" [flags]
Alias for creating a doc in the configured ADR section. Picks the next ADR number (NNNN-slug.md),
status proposed. Same flags as \`new\`, plus:
  --context <t> --decision <t> --consequences <t>   fill those template sections in one call
Without them the template headings are created empty; fill later with \`docs-axi write <n> --section Decision\`.
examples:
  docs-axi adr add "Use Postgres for the job queue" --summary "Why jobs live in Postgres, not Redis"
`,
};

export function requireAdrSection(ctx: Ctx, command: string): string {
  const adr = ctx.config.layout.adr;
  if (adr === undefined) {
    throw new AxiError(`${command} requires an ADR section`, "VALIDATION_ERROR", [
      'Set `docs.adr = "<section>"` in `.plan-axi.toml` to enable ADR commands',
    ]);
  }
  return adr;
}

function createDoc(ctx: Ctx, section: string, titleRaw: string, p: Parsed): AxiStructuredOutput {
  if (!isSectionIn(ctx.config.layout, section)) {
    throw new AxiError(`unknown section ${section}`, "VALIDATION_ERROR", [
      `Sections:\n${layoutGuideLines(ctx.config.layout)}`,
    ]);
  }
  const isAdr = isAdrSection(ctx.config.layout, section);
  requireDocsDir(ctx);
  const title = requireSingleLine("title", titleRaw);
  const summaryRaw = flagStr(p, "--summary");
  if (summaryRaw === undefined) {
    throw new AxiError("--summary is required", "VALIDATION_ERROR", [
      `docs-axi ${isAdr ? "adr add" : `new ${section}`} "${title}" --summary "<one line>"`,
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
  if (statusRaw !== undefined && !isAdr) {
    throw new AxiError("--status applies to the ADR section only", "VALIDATION_ERROR");
  }
  const status = isAdr ? checkStatus(statusRaw ?? "proposed") : undefined;

  const docs = loadDocs(ctx);
  const num = isAdr ? nextAdrNumber(docs) : undefined;
  const file = num === undefined ? `${slug}.md` : `${String(num).padStart(4, "0")}-${slug}.md`;
  const path = `${section}/${file}`;
  const clash = docs.find((d) => d.path.toLowerCase() === path.toLowerCase());
  if (clash) {
    return { created: `${clash.path} already exists (no-op)`, help: [`Run \`docs-axi show ${clash.path}\``] };
  }
  let body = isAdr ? adrBody(title) : docBody(title);
  const given = readBodyInput(p, false);
  if (given !== undefined) {
    if (parseDoc(given).hasFrontmatter) {
      throw new AxiError("body must not contain frontmatter", "VALIDATION_ERROR", [
        "Pass the body only; docs-axi writes the frontmatter",
      ]);
    }
    body = given;
  }
  if (isAdr) {
    const parts: [string, string | undefined][] = [
      ["Context", flagStr(p, "--context")],
      ["Decision", flagStr(p, "--decision")],
      ["Consequences", flagStr(p, "--consequences")],
    ];
    if (parts.some(([, v]) => v !== undefined) && given !== undefined) {
      throw new AxiError("use either a body or --context/--decision/--consequences", "VALIDATION_ERROR");
    }
    for (const [name, v] of parts) {
      if (v !== undefined) body = editSection(body, { mode: "write", selector: name, text: v.replace(/\r\n/g, "\n") }).next;
    }
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
    help: [
      isAdr
        ? `Fill sections with \`docs-axi write ${path} --section Context|Decision|Consequences\` (body on stdin)`
        : `Add sections with \`docs-axi write ${path} --section "<name>" --add\` (body on stdin)`,
      "Run `docs-axi check` before committing",
    ],
  };
}

export function newCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(NEW_SPEC, args);
  return createDoc(ctx, p.pos[0] as string, p.pos[1] as string, p);
}

export function adrAddCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(ADR_SPEC, args);
  return createDoc(ctx, requireAdrSection(ctx, "adr add"), p.pos[0] as string, p);
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
Edit frontmatter only (edit the body with write or append) and regenerate the index.
Idempotent: unchanged values report a no-op.
flags:
  --title <t>      new title
  --summary <s>    new one-line summary (max ${MAX_SUMMARY} chars)
  --tags a,b       replace tags; pass --tags= to clear
  --status <s>     ADR section only: proposed | accepted | superseded | deprecated
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
  const adrSection = status !== undefined ? requireAdrSection(ctx, "update --status") : undefined;
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
    if (!isAdrSection(ctx.config.layout, d.section)) {
      throw new AxiError(`--status applies to ${adrSection} only`, "VALIDATION_ERROR");
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
  requireAdrSection(ctx, "supersede");
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
        `Only files named ${ctx.config.layout.adr}/NNNN-slug.md can supersede or be superseded`,
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
