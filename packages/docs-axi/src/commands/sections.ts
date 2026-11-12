import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, flagStr, parseArgs, type CmdSpec, type Parsed } from "../args.js";
import { readBodyInput } from "../body.js";
import { readText, writeText } from "../fsutil.js";
import { writeIndex } from "../indexgen.js";
import { loadDocs, requireDocsDir, resolveDocPath, type Ctx } from "../model.js";
import { editSection, readSection, splitDoc } from "../sectionedit.js";
import { sectionText } from "../sections.js";

function locate(ctx: Ctx, ref: string): { path: string; abs: string; raw: string } {
  requireDocsDir(ctx);
  const d = resolveDocPath(ctx, ref, loadDocs(ctx));
  const abs = join(ctx.docsDir, d.path);
  return { path: d.path, abs, raw: readText(abs) };
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
  docs-axi sections <section>/<doc>
`,
};

export function sectionsTable(raw: string): Record<string, string | number>[] {
  const l = splitDoc(raw);
  return l.secs.map((s) => {
    const chars = sectionText(l.lines, s, false).length;
    return { ref: s.ref, level: s.level, line: s.head + 1, chars, empty: chars === 0 ? "yes" : "no" };
  });
}

export function sectionsCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SECTIONS_SPEC, args);
  const l = locate(ctx, p.pos[0] as string);
  const rows = sectionsTable(l.raw);
  if (rows.length === 0) {
    return { doc: l.path, sections: "0 headings", help: ["Add one with `docs-axi write <doc> --section <name> --add`"] };
  }
  return {
    doc: l.path,
    sections: rows,
    help: [
      "Run `docs-axi show <doc> --section <ref>` to read one",
      "Run `docs-axi write <doc> --section <ref>` (stdin) to replace one",
    ],
  };
}

// ---------------------------------------------------------------- show --section

export function renderSection(raw: string, label: string, selector: string, tree: boolean): string {
  const r = readSection(raw, selector, tree);
  const s = r.section;
  const out = [`doc: ${label}`, `section: ${s.ref} (line ${s.head + 1}, level ${s.level}${tree ? ", with subsections" : ""})`, ""];
  out.push(r.text === "" ? "(empty)" : r.text);
  if (!tree && r.children.length > 0) {
    out.push("", "help[1]:", `  Subsections not shown: ${r.children.join(", ")}. Add --tree to include them`);
  }
  return out.join("\n");
}

export function showSection(ctx: Ctx, docRef: string, selector: string, tree: boolean): string {
  const l = locate(ctx, docRef);
  return renderSection(l.raw, l.path, selector, tree);
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
  docs-axi write <section>/<doc> --section Why --body "Slow builds hurt CI."
  printf 'text' | docs-axi write <section>/<doc> --section "Refunds/Edge cases" --add
`,
};

export const APPEND_SPEC: CmdSpec = {
  name: "append",
  flags: { ...WRITE_FLAGS },
  min: 1,
  max: 1,
  usage: "docs-axi append <path|adr-number> --section <ref> [--body <t> | --body-file <p>]",
  help: `usage: docs-axi append <path|adr-number> --section <ref> [flags]
Add text to the end of a section's own content (lists, logs). Same input as \`write\`. Creates the section if missing (no --add needed).
Not idempotent: running twice appends twice.
examples:
  docs-axi append <section>/<doc> --section "Open questions" --body "- Tax rounding?"
`,
};

function applyEdit(ctx: Ctx, args: string[], mode: "write" | "append"): AxiStructuredOutput {
  const p = parseArgs(mode === "write" ? WRITE_SPEC : APPEND_SPEC, args);
  const selector = needSection(p);
  const l = locate(ctx, p.pos[0] as string);
  const text = readBodyInput(p) as string;
  const afterSel = flagStr(p, "--after");
  const r = editSection(l.raw, {
    mode,
    selector,
    text,
    add: mode === "append" || flagBool(p, "--add"),
    tree: flagBool(p, "--tree"),
    ...(afterSel !== undefined ? { after: afterSel } : {}),
  });
  if (!r.changed) return { [mode]: `${l.path} "${r.ref}" unchanged (no-op)` };
  writeText(l.abs, r.next);
  return {
    [mode]: `${l.path} "${r.ref}" ${r.action}`,
    lines: r.lines,
    index: writeIndex(ctx, loadDocs(ctx)) ? "updated" : "unchanged",
  };
}

export const writeCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => applyEdit(ctx, args, "write");
export const appendCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => applyEdit(ctx, args, "append");
