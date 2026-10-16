import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, flagStr, parseArgs, type CmdSpec, type Parsed } from "../args.js";
import { applyEol, detectEol, normalizeEol, readText, writeText } from "../fsutil.js";
import { parseDoc } from "../frontmatter.js";
import { writeIndex } from "../indexgen.js";
import { loadDocs, requireDocsDir, resolveDocPath, type Ctx } from "../model.js";
import {
  appendToSection,
  checkBody,
  findSection,
  findSectionOrUndefined,
  insertSection,
  parseSections,
  replaceSection,
  sectionText,
  splitLines,
  type Section,
} from "../sections.js";

/** Body text from --body, --body-file (`-` = stdin) or piped stdin. */
export function readBodyInput(p: Parsed, required = true): string | undefined {
  const inline = flagStr(p, "--body");
  const file = flagStr(p, "--body-file");
  if (inline !== undefined && file !== undefined) {
    throw new AxiError("pass only one of --body and --body-file", "VALIDATION_ERROR");
  }
  if (inline !== undefined) return normalizeEol(inline);
  if (file !== undefined && file !== "-") {
    if (!existsSync(file)) throw new AxiError(`--body-file not found: ${file}`, "NOT_FOUND");
    return normalizeEol(readText(file));
  }
  if (file === "-" || (required && !process.stdin.isTTY)) return readStdin();
  if (required) {
    throw new AxiError("no body given", "VALIDATION_ERROR", [
      "Pipe the text on stdin, or pass --body <text> or --body-file <path>",
    ]);
  }
  return undefined;
}

function readStdin(): string {
  try {
    return normalizeEol(readFileSync(0, "utf8"));
  } catch {
    throw new AxiError("could not read stdin", "VALIDATION_ERROR", ["Pass --body <text> or --body-file <path>"]);
  }
}

interface Loaded {
  path: string;
  abs: string;
  eol: "\n" | "\r\n";
  norm: string;
  prefix: string;
  lead: string;
  core: string;
  lines: string[];
  secs: Section[];
}

function load(ctx: Ctx, ref: string): Loaded {
  requireDocsDir(ctx);
  const d = resolveDocPath(ctx, ref, loadDocs(ctx));
  const abs = join(ctx.docsDir, d.path);
  const raw = readText(abs);
  const norm = normalizeEol(raw);
  const parsed = parseDoc(norm);
  const prefix = norm.slice(0, norm.length - parsed.body.length);
  const lead = /^\n*/.exec(parsed.body)?.[0] ?? "";
  const core = parsed.body.slice(lead.length);
  return {
    path: d.path,
    abs,
    eol: detectEol(raw),
    norm,
    prefix,
    lead,
    core,
    lines: splitLines(core),
    secs: parseSections(core),
  };
}

function needSection(p: Parsed): string {
  const s = flagStr(p, "--section");
  if (s === undefined || s.trim() === "") {
    throw new AxiError("--section is required", "VALIDATION_ERROR", ["Run `docs-axi sections <doc>` to list headings"]);
  }
  return s;
}

// ---------------------------------------------------------------- sections

export const SECTIONS_SPEC: CmdSpec = {
  name: "sections",
  flags: {},
  min: 1,
  max: 1,
  usage: "docs-axi sections <path|adr-number>",
  help: `usage: docs-axi sections <path|adr-number>
List a doc's headings (outside code fences) with a selector for each.
Columns: ref (pass to --section), level, line, chars (own content), empty (no own text).
Selectors: "Why", "Approach/Alternatives" (heading chain), "Notes#2" (2nd of identical matches).
examples:
  docs-axi sections domain/billing
`,
};

export function sectionsCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SECTIONS_SPEC, args);
  const l = load(ctx, p.pos[0] as string);
  if (l.secs.length === 0) {
    return { doc: l.path, sections: "0 headings", help: ["Add one with `docs-axi write <doc> --section <name> --add`"] };
  }
  return {
    doc: l.path,
    sections: l.secs.map((s) => {
      const chars = sectionText(l.lines, s, false).length;
      return { ref: s.ref, level: s.level, line: s.head + 1, chars, empty: chars === 0 ? "yes" : "no" };
    }),
    help: [
      "Run `docs-axi show <doc> --section <ref>` to read one",
      "Run `docs-axi write <doc> --section <ref>` (stdin) to replace one",
    ],
  };
}

// ---------------------------------------------------------------- show --section

export function showSection(ctx: Ctx, docRef: string, selector: string, tree: boolean): string {
  const l = load(ctx, docRef);
  const s = findSection(l.secs, selector);
  const text = sectionText(l.lines, s, tree);
  const out = [`doc: ${l.path}`, `section: ${s.ref} (line ${s.head + 1}, level ${s.level}${tree ? ", with subsections" : ""})`, ""];
  out.push(text === "" ? "(empty)" : text);
  const kids = l.secs.filter((c) => c.head > s.head && c.head < s.treeEnd && c.parents.length === s.parents.length + 1);
  if (!tree && kids.length > 0) {
    out.push("", "help[1]:", `  Subsections not shown: ${kids.map((k) => k.title).join(", ")}. Add --tree to include them`);
  }
  return out.join("\n");
}

// ---------------------------------------------------------------- write / append

const WRITE_FLAGS = {
  "--section": "string",
  "--body": "string",
  "--body-file": "string",
  "--add": "boolean",
  "--after": "string",
  "--tree": "boolean",
} as const;

export const WRITE_SPEC: CmdSpec = {
  name: "write",
  flags: WRITE_FLAGS,
  min: 1,
  max: 1,
  usage: "docs-axi write <path|adr-number> --section <ref> [--body <t> | --body-file <p>] [--add] [--after <ref>] [--tree]",
  help: `usage: docs-axi write <path|adr-number> --section <ref> [flags]
Replace one section's content. The heading is kept. Body comes from stdin, --body, or --body-file (- = stdin).
Output never echoes the body. Idempotent: same content reports a no-op.
flags:
  --section <ref>   heading text, "Parent/Child", or "Heading#N" (see \`docs-axi sections\`)
  --add             create the section if missing (level = parent+1, else 2; at end of parent/doc)
  --after <ref>     with --add: place after this section's subtree (same level)
  --tree            replace subsections too (default: only text before the first subsection)
Body may not contain headings at or above the section's level (no frontmatter either).
examples:
  docs-axi write plan/x --section Why --body "Slow builds hurt CI."
  printf 'text' | docs-axi write domain/billing --section "Refunds/Edge cases" --add
`,
};

export const APPEND_SPEC: CmdSpec = {
  name: "append",
  flags: { ...WRITE_FLAGS },
  min: 1,
  max: 1,
  usage: "docs-axi append <path|adr-number> --section <ref> [--body <t> | --body-file <p>] [--add]",
  help: `usage: docs-axi append <path|adr-number> --section <ref> [flags]
Add text to the end of a section's own content (lists, logs). Same input and flags as \`write\`.
Not idempotent: running twice appends twice.
examples:
  docs-axi append domain/billing --section "Open questions" --body "- Tax rounding?"
`,
};

function applyEdit(ctx: Ctx, args: string[], mode: "write" | "append"): AxiStructuredOutput {
  const spec = mode === "write" ? WRITE_SPEC : APPEND_SPEC;
  const p = parseArgs(spec, args);
  const selector = needSection(p);
  const add = flagBool(p, "--add");
  const tree = flagBool(p, "--tree");
  if (mode === "append" && (tree || flagStr(p, "--after") !== undefined)) {
    throw new AxiError("--tree and --after do not apply to append", "VALIDATION_ERROR");
  }
  const l = load(ctx, p.pos[0] as string);
  const text = readBodyInput(p) as string;
  const afterSel = flagStr(p, "--after");
  if (afterSel !== undefined && !add) throw new AxiError("--after needs --add", "VALIDATION_ERROR");
  const found = add ? findSectionOrUndefined(l.secs, selector) : findSection(l.secs, selector);
  let nextCore: string;
  let ref: string;
  let action: string;
  if (!found) {
    const after = afterSel === undefined ? undefined : findSection(l.secs, afterSel);
    const r = insertSection(l.core, l.secs, selector, text, after);
    nextCore = r.body;
    ref = r.ref;
    action = "created";
  } else {
    checkBody(text, found.level);
    nextCore =
      mode === "write"
        ? replaceSection(l.core, found, text, tree)
        : appendToSection(l.core, found, text);
    ref = found.ref;
    action = mode === "write" ? "replaced" : "appended";
  }
  const next = l.prefix + l.lead + nextCore;
  if (next === l.norm) return { [mode]: `${l.path} "${ref}" unchanged (no-op)` };
  writeText(l.abs, applyEol(next, l.eol));
  const s = findSection(parseSections(nextCore), ref);
  const nLines = splitLines(sectionText(splitLines(nextCore), s, mode === "write" && tree)).length;
  return {
    [mode]: `${l.path} "${ref}" ${action}`,
    lines: nLines,
    index: writeIndex(ctx, loadDocs(ctx)) ? "updated" : "unchanged",
  };
}

export const writeCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => applyEdit(ctx, args, "write");
export const appendCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => applyEdit(ctx, args, "append");
