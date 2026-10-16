import { AxiError } from "axi-sdk-js";
import { applyEol, detectEol, normalizeEol } from "./fsutil.js";
import { parseDoc } from "./frontmatter.js";
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
} from "./sections.js";

/** A markdown file split into frontmatter prefix, leading blanks and the heading-bearing core. */
export interface SplitDoc {
  eol: "\n" | "\r\n";
  norm: string;
  prefix: string;
  lead: string;
  core: string;
  lines: string[];
  secs: Section[];
}

export function splitDoc(raw: string): SplitDoc {
  const eol = detectEol(raw);
  const norm = normalizeEol(raw);
  const parsed = parseDoc(norm);
  const prefix = norm.slice(0, norm.length - parsed.body.length);
  const lead = /^\n*/.exec(parsed.body)?.[0] ?? "";
  const core = parsed.body.slice(lead.length);
  return { eol, norm, prefix, lead, core, lines: splitLines(core), secs: parseSections(core) };
}

export function readSection(raw: string, selector: string, tree: boolean): { section: Section; text: string; children: string[]; doc: SplitDoc } {
  const doc = splitDoc(raw);
  const section = findSection(doc.secs, selector);
  const children = doc.secs
    .filter((c) => c.head > section.head && c.head < section.treeEnd && c.parents.length === section.parents.length + 1)
    .map((c) => c.title);
  return { section, text: sectionText(doc.lines, section, tree), children, doc };
}

export interface EditOptions {
  mode: "write" | "append";
  selector: string;
  text: string;
  add?: boolean;
  after?: string;
  tree?: boolean;
}

export interface EditResult {
  /** New file text (original EOL). Equal to the input when nothing changed. */
  next: string;
  changed: boolean;
  ref: string;
  action: "created" | "replaced" | "appended";
  lines: number;
}

export function editSection(raw: string, o: EditOptions): EditResult {
  const l = splitDoc(raw);
  if (o.after !== undefined && !o.add) throw new AxiError("--after needs --add", "VALIDATION_ERROR");
  if (o.mode === "append" && (o.tree || o.after !== undefined)) {
    throw new AxiError("--tree and --after do not apply to append", "VALIDATION_ERROR");
  }
  const found = o.add ? findSectionOrUndefined(l.secs, o.selector) : findSection(l.secs, o.selector);
  let nextCore: string;
  let ref: string;
  let action: EditResult["action"];
  if (!found) {
    const after = o.after === undefined ? undefined : findSection(l.secs, o.after);
    const r = insertSection(l.core, l.secs, o.selector, o.text, after);
    nextCore = r.body;
    ref = r.ref;
    action = "created";
  } else {
    checkBody(o.text, found.level);
    nextCore =
      o.mode === "write"
        ? replaceSection(l.core, found, o.text, o.tree === true)
        : appendToSection(l.core, found, o.text);
    ref = found.ref;
    action = o.mode === "write" ? "replaced" : "appended";
  }
  const next = l.prefix + l.lead + nextCore;
  const s = findSection(parseSections(nextCore), ref);
  const lines = splitLines(sectionText(splitLines(nextCore), s, o.mode === "write" && o.tree === true)).length;
  return { next: applyEol(next, l.eol), changed: next !== l.norm, ref, action, lines };
}
