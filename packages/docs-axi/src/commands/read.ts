import { existsSync } from "node:fs";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, flagStr, parseArgs, parseLimit, type CmdSpec } from "../args.js";
import {
  displayTitle,
  docSectionNames,
  isDocSectionIn,
  layoutGuideLines,
  loadDocs,
  requireDocsDir,
  resolveDocPath,
  type Ctx,
  docsRel,
  type Doc,
} from "../model.js";
import { readText, normalizeEol, toPosix } from "../fsutil.js";
import { join } from "node:path";
import { parseDoc } from "../frontmatter.js";
import { showSection } from "./sections.js";

const HOME_ROWS = 40;
const SHOW_CHARS = 1500;

function row(d: Doc, withStatus: boolean): Record<string, string> {
  const r: Record<string, string> = {
    path: d.path,
    title: displayTitle(d),
    summary: d.summary ?? "(no summary)",
  };
  if (withStatus) r["status"] = d.status ?? "-";
  return r;
}

export function homeCommand(ctx: Ctx): AxiStructuredOutput {
  if (!existsSync(ctx.docsDir)) {
    return {
      docs: `no docs folder at ${docsRel(ctx)}`,
      help: ["Run `docs-axi init` to scaffold the configured docs layout"],
    };
  }
  const docs = loadDocs(ctx);
  if (docs.length === 0) {
    return {
      docs: "0 docs yet (folder exists)",
      help: [
        `Run \`docs-axi new <section> "<title>" --summary "<one line>"\` to add one. Sections:\n${layoutGuideLines(ctx.config.layout)}`,
      ],
    };
  }
  const withStatus = docs.some((d) => d.status !== undefined);
  const shown = docs.slice(0, HOME_ROWS);
  const help = [
    "Run `docs-axi search <terms>` to find docs by topic",
    "Run `docs-axi show <path>` to read one",
  ];
  if (docs.length > shown.length) help.unshift(`Run \`docs-axi list\` for all ${docs.length} docs`);
  return {
    counts: Object.fromEntries(
      docSectionNames(ctx.config.layout).map((s) => [s, docs.filter((d) => d.section === s).length]),
    ),
    sections: Object.fromEntries(ctx.config.layout.sections.map((s) => [s.name, s.guide])),
    docs: shown.map((d) => row(d, withStatus)),
    help,
  };
}

export const LIST_SPEC: CmdSpec = {
  name: "list",
  flags: { "--tag": "string", "--status": "string", "--limit": "string" },
  min: 0,
  max: 1,
  usage: "docs-axi list [section] [--tag <t>] [--status <s>] [--limit <n>]",
  help: `usage: docs-axi list [section] [--tag <t>] [--status <s>] [--limit <n>]
List docs with title and one-line summary, sorted by path.
section: configured section name | other
flags:
  --tag <t>      only docs with this tag
  --status <s>   only ADRs with this status (proposed|accepted|superseded|deprecated)
  --limit <n>    max rows (default 100)
examples:
  docs-axi list
  docs-axi list <section> --status accepted
  docs-axi list <section> --tag billing
`,
};

export function listCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(LIST_SPEC, args);
  requireDocsDir(ctx);
  const section = p.pos[0];
  if (section !== undefined && !isDocSectionIn(ctx.config.layout, section)) {
    throw new AxiError(`unknown section ${section}`, "VALIDATION_ERROR", [
      `Sections:\n${layoutGuideLines(ctx.config.layout)}\n  other - docs outside the configured sections`,
    ]);
  }
  const tag = flagStr(p, "--tag");
  const status = flagStr(p, "--status");
  const limit = parseLimit(p, 100);
  const all = loadDocs(ctx);
  const hits = all.filter(
    (d) =>
      (section === undefined || d.section === section) &&
      (tag === undefined || d.tags.includes(tag)) &&
      (status === undefined || d.status === status),
  );
  if (hits.length === 0) {
    return {
      docs: `0 docs match${section ? ` in ${section}` : ""}${tag ? ` tag=${tag}` : ""}${status ? ` status=${status}` : ""} (${all.length} docs total)`,
    };
  }
  const shown = hits.slice(0, limit);
  const withStatus = shown.some((d) => d.status !== undefined);
  const out: AxiStructuredOutput = {
    count: `${shown.length} of ${hits.length}`,
    docs: shown.map((d) => row(d, withStatus)),
  };
  if (hits.length > shown.length) {
    out["help"] = [`Run \`docs-axi list${section ? ` ${section}` : ""} --limit ${hits.length}\` for all`];
  }
  return out;
}

export const SEARCH_SPEC: CmdSpec = {
  name: "search",
  flags: { "--section": "string", "--limit": "string" },
  min: 1,
  max: 20,
  usage: "docs-axi search <terms...> [--section <s>] [--limit <n>]",
  help: `usage: docs-axi search <terms...> [--section <s>] [--limit <n>]
Lexical search over title, tags, summary, headings and body. Ranked, deterministic.
Docs matching more of the terms rank first.
flags:
  --section <s>  configured section name | other
  --limit <n>    max rows (default 10)
examples:
  docs-axi search billing invoice
  docs-axi search cache --section <section>
`,
};

function terms(raw: string[]): string[] {
  const out = new Set<string>();
  for (const part of raw)
    for (const t of part.toLowerCase().split(/[^a-z0-9]+/)) if (t !== "") out.add(t);
  return [...out];
}

function headings(body: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^#{1,6}\s/.test(line)) out.push(line.replace(/^#+\s*/, ""));
  }
  return out.join(" ").toLowerCase();
}

export function searchCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SEARCH_SPEC, args);
  requireDocsDir(ctx);
  const section = flagStr(p, "--section");
  if (section !== undefined && !isDocSectionIn(ctx.config.layout, section)) {
    throw new AxiError(`unknown section ${section}`, "VALIDATION_ERROR", [
      `Sections:\n${layoutGuideLines(ctx.config.layout)}\n  other - docs outside the configured sections`,
    ]);
  }
  const limit = parseLimit(p, 10);
  const ts = terms(p.pos);
  if (ts.length === 0) {
    throw new AxiError("search needs at least one alphanumeric term", "VALIDATION_ERROR");
  }
  const scored: { d: Doc; matched: number; score: number }[] = [];
  for (const d of loadDocs(ctx)) {
    if (section !== undefined && d.section !== section) continue;
    const title = displayTitle(d).toLowerCase();
    const tags = d.tags.join(" ").toLowerCase();
    const summary = (d.summary ?? "").toLowerCase();
    const heads = headings(d.parsed.body);
    const body = d.parsed.body.toLowerCase();
    const path = d.path.toLowerCase();
    let matched = 0;
    let score = 0;
    for (const t of ts) {
      let s = 0;
      if (title.includes(t)) s += 5;
      if (tags.includes(t)) s += 4;
      if (summary.includes(t)) s += 3;
      if (heads.includes(t)) s += 2;
      if (path.includes(t)) s += 2;
      if (body.includes(t)) s += 1;
      if (s > 0) matched++;
      score += s;
    }
    if (matched > 0) scored.push({ d, matched, score });
  }
  scored.sort(
    (a, b) =>
      b.matched - a.matched || b.score - a.score || (a.d.path < b.d.path ? -1 : 1),
  );
  if (scored.length === 0) {
    return {
      docs: `0 matches for: ${ts.join(" ")}`,
      help: [
        "Run `docs-axi list` to browse all docs",
        "If this area is undocumented, say so in the plan and add docs with `docs-axi new`",
      ],
    };
  }
  const shown = scored.slice(0, limit);
  const withStatus = shown.some((s) => s.d.status !== undefined);
  const out: AxiStructuredOutput = {
    count: `${shown.length} of ${scored.length} matches`,
    docs: shown.map((s) => row(s.d, withStatus)),
  };
  out["help"] = ["Run `docs-axi show <path>` to read one"];
  return out;
}

export const SHOW_SPEC: CmdSpec = {
  name: "show",
  flags: { "--full": "boolean", "--section": "string", "--tree": "boolean" },
  min: 1,
  max: 1,
  usage: "docs-axi show <path|adr-number> [--full] [--section <ref> [--tree]]",
  help: `usage: docs-axi show <path|adr-number> [--full] [--section <ref> [--tree]]
Print one doc, or one section with --section (see \`docs-axi sections\`; --tree adds subsections).
Print one doc. Body is truncated at ${SHOW_CHARS} chars unless --full.
<path> may be domain/foo, domain/foo.md, docs/domain/foo.md, or an ADR number.
examples:
  docs-axi show domain/billing
  docs-axi show 7 --full
`,
};

export function showCommand(ctx: Ctx, args: string[]): string {
  const p = parseArgs(SHOW_SPEC, args);
  requireDocsDir(ctx);
  const sel = flagStr(p, "--section");
  if (sel !== undefined) return showSection(ctx, p.pos[0] as string, sel, flagBool(p, "--tree"));
  const d = resolveDocPath(ctx, p.pos[0] as string, loadDocs(ctx));
  const full = flagBool(p, "--full");
  const parsed = parseDoc(normalizeEol(readText(join(ctx.docsDir, d.path))));
  const body = parsed.body.replace(/^\n+/, "");
  const header: string[] = ["doc:", `  path: ${d.path}`, `  title: ${JSON.stringify(displayTitle(d))}`];
  if (d.summary) header.push(`  summary: ${JSON.stringify(d.summary)}`);
  if (d.tags.length) header.push(`  tags: ${d.tags.join(",")}`);
  if (d.status) header.push(`  status: ${d.status}`);
  if (d.supersedes.length) header.push(`  supersedes: ${d.supersedes.join(",")}`);
  if (d.supersededBy) header.push(`  superseded-by: ${d.supersededBy}`);
  header.push(`  size: ${body.length} chars`);
  const truncated = !full && body.length > SHOW_CHARS;
  const shown = truncated ? body.slice(0, SHOW_CHARS) : body;
  const lines = [header.join("\n"), "", shown.replace(/\n+$/, "")];
  if (truncated) {
    lines.push(
      "",
      `... (truncated, ${body.length} chars total)`,
      "help[1]:",
      `  Run \`docs-axi show ${d.path} --full\` to see the complete doc`,
    );
  }
  return lines.join("\n");
}
