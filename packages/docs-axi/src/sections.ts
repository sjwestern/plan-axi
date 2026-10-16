import { AxiError } from "axi-sdk-js";

/** A markdown ATX heading and the line range it covers. All indexes are 0-based line numbers of the LF body. */
export interface Section {
  /** 1-based order of appearance. */
  n: number;
  level: number;
  title: string;
  /** Heading line. */
  head: number;
  /** First line after the heading. */
  start: number;
  /** End (exclusive) of own content: the next heading of any level. */
  ownEnd: number;
  /** End (exclusive) of the subtree: the next heading of the same or higher level. */
  treeEnd: number;
  /** Titles of enclosing headings, outermost first. */
  parents: string[];
  /** Shortest selector that resolves to this section alone. */
  ref: string;
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^\s{0,3}(```+|~~~+)/;

export function splitLines(body: string): string[] {
  return body === "" ? [] : body.replace(/\n$/, "").split("\n");
}

/** Heading lines outside fenced code blocks: [lineIndex, level, title]. */
export function scanHeadings(lines: string[]): [number, number, string][] {
  const out: [number, number, string][] = [];
  let fence: string | undefined;
  lines.forEach((line, i) => {
    const f = FENCE.exec(line);
    if (f) {
      const mark = f[1] as string;
      if (fence === undefined) fence = mark[0] as string;
      else if (mark[0] === fence) fence = undefined;
      return;
    }
    if (fence !== undefined) return;
    const m = HEADING.exec(line);
    if (m) out.push([i, (m[1] as string).length, m[2] as string]);
  });
  return out;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

export function parseSections(body: string): Section[] {
  const lines = splitLines(body);
  const heads = scanHeadings(lines);
  const secs: Section[] = [];
  const stack: { level: number; title: string }[] = [];
  heads.forEach(([head, level, title], idx) => {
    while (stack.length > 0 && (stack[stack.length - 1] as { level: number }).level >= level) stack.pop();
    const next = heads[idx + 1];
    let treeEnd = lines.length;
    for (let j = idx + 1; j < heads.length; j++) {
      if ((heads[j] as [number, number, string])[1] <= level) {
        treeEnd = (heads[j] as [number, number, string])[0];
        break;
      }
    }
    secs.push({
      n: idx + 1,
      level,
      title,
      head,
      start: head + 1,
      ownEnd: next ? next[0] : lines.length,
      treeEnd,
      parents: stack.map((s) => s.title),
      ref: "",
    });
    stack.push({ level, title });
  });
  for (const s of secs) s.ref = computeRef(s, secs);
  return secs;
}

function chain(s: Section): string[] {
  return [...s.parents, s.title];
}

function matchesPath(s: Section, segs: string[]): boolean {
  const c = chain(s);
  if (segs.length > c.length) return false;
  const tail = c.slice(c.length - segs.length);
  return segs.every((seg, i) => norm(seg) === norm(tail[i] as string));
}

function computeRef(s: Section, all: Section[]): string {
  const c = chain(s);
  for (let k = 1; k <= c.length; k++) {
    const segs = c.slice(c.length - k);
    if (all.filter((o) => matchesPath(o, segs)).length === 1) return segs.join("/");
  }
  const full = c.join("/");
  const same = all.filter((o) => matchesPath(o, c));
  return `${full}#${same.indexOf(s) + 1}`;
}

/**
 * Selector grammar: `Heading`, `Parent/Child` (suffix of the heading chain), optional `#N`
 * (1-based pick among identical matches). Case and spacing insensitive. A selector that equals a
 * heading's full text (e.g. "Input/Output") is matched literally first.
 */
export function findSection(secs: Section[], selector: string): Section {
  const sel = selector.trim();
  const idxM = /^(.*\S)\s*#(\d+)$/.exec(sel);
  const attempts: { text: string; pick?: number }[] = [{ text: sel }];
  if (idxM) attempts.push({ text: idxM[1] as string, pick: Number(idxM[2]) });
  for (const a of attempts) {
    const literal = secs.filter((s) => norm(s.title) === norm(a.text));
    const hits = literal.length > 0 ? literal : secs.filter((s) => matchesPath(s, a.text.split("/")));
    if (hits.length === 0) continue;
    if (a.pick !== undefined) {
      const hit = hits[a.pick - 1];
      if (!hit) {
        throw new AxiError(`selector "${selector}": only ${hits.length} match(es)`, "NOT_FOUND", [
          `Run \`docs-axi sections <doc>\` to list headings`,
        ]);
      }
      return hit;
    }
    if (hits.length > 1) {
      throw new AxiError(`selector "${selector}" matches ${hits.length} sections`, "AMBIGUOUS", [
        ...hits.map((h) => `--section "${h.ref}"  (line ${h.head + 1}, level ${h.level})`),
        'Use "Parent/Child" or "Heading#N" to pick one',
      ]);
    }
    return hits[0] as Section;
  }
  throw new AxiError(`no section matches "${selector}"`, "NOT_FOUND", [
    "Run `docs-axi sections <doc>` to list headings",
    "Pass --add to create it",
  ]);
}

export function findSectionOrUndefined(secs: Section[], selector: string): Section | undefined {
  try {
    return findSection(secs, selector);
  } catch (e) {
    if (e instanceof AxiError && e.code === "NOT_FOUND" && /^no section/.test(e.message)) return undefined;
    throw e;
  }
}

export function sectionText(lines: string[], s: Section, tree: boolean): string {
  const end = tree ? s.treeEnd : s.ownEnd;
  return lines.slice(s.start, end).join("\n").replace(/^\n+|\n+$/g, "");
}

/** Reject text that would change the section structure around the target. */
export function checkBody(text: string, level: number): void {
  if (/^---\n/.test(text)) {
    throw new AxiError("body must not contain frontmatter", "VALIDATION_ERROR");
  }
  const bad = scanHeadings(splitLines(text)).find(([, l]) => l <= level);
  if (bad) {
    throw new AxiError(
      `body contains a level-${bad[1]} heading "${bad[2]}" but the section is level ${level}`,
      "VALIDATION_ERROR",
      [
        "Section bodies may only hold deeper headings; pass the content without the section's own heading",
        "Add a sibling with `--add`",
      ],
    );
  }
}

function block(text: string): string[] {
  const t = text.replace(/^\n+|\n+$/g, "");
  return t === "" ? [] : ["", ...t.split("\n")];
}

/** Replace the section content (own, or whole subtree). Heading is kept. */
export function replaceSection(bodyText: string, s: Section, text: string, tree: boolean): string {
  const lines = splitLines(bodyText);
  const end = tree ? s.treeEnd : s.ownEnd;
  const repl = [...block(text)];
  if (end < lines.length) repl.push("");
  return join([...lines.slice(0, s.head + 1), ...repl, ...lines.slice(end)]);
}

export function appendToSection(bodyText: string, s: Section, text: string): string {
  const lines = splitLines(bodyText);
  const own = lines.slice(s.start, s.ownEnd);
  while (own.length > 0 && (own[own.length - 1] as string).trim() === "") own.pop();
  const add = text.replace(/^\n+|\n+$/g, "");
  if (add === "") return bodyText;
  const merged = [...own];
  if (merged.length === 0 || (merged[0] as string).trim() !== "") merged.unshift("");
  merged.push(...add.split("\n"));
  if (s.ownEnd < lines.length) merged.push("");
  return join([...lines.slice(0, s.start), ...merged, ...lines.slice(s.ownEnd)]);
}

/** Insert a new section. `after` places it after that section's subtree; default end of doc or of the parent. */
export function insertSection(
  bodyText: string,
  secs: Section[],
  path: string,
  text: string,
  after?: Section,
): { body: string; ref: string } {
  const segs = path.split("/").map((x) => x.trim()).filter((x) => x !== "");
  const title = segs.pop();
  if (!title) throw new AxiError("empty section name", "VALIDATION_ERROR");
  let parent: Section | undefined;
  if (segs.length > 0) parent = findSection(secs, segs.join("/"));
  const level = parent ? parent.level + 1 : after ? after.level : 2;
  if (level > 6) throw new AxiError("heading level would exceed 6", "VALIDATION_ERROR");
  checkBody(text, level);
  const lines = splitLines(bodyText);
  let at = after ? after.treeEnd : parent ? parent.treeEnd : lines.length;
  while (at > 0 && (lines[at - 1] as string).trim() === "") at--;
  const ins = ["", `${"#".repeat(level)} ${title}`, ...block(text)];
  const tail = lines.slice(at);
  const out = [...lines.slice(0, at), ...ins, ...(tail.length > 0 && tail[0]!.trim() !== "" ? [""] : []), ...tail];
  const body = join(out);
  const ns = parseSections(body);
  const headIdx = at === 0 ? 0 : at + 1;
  const made = ns.find((s) => s.head === headIdx) ?? (ns[ns.length - 1] as Section);
  return { body, ref: made.ref };
}

function join(lines: string[]): string {
  const text = lines.join("\n").replace(/^\n+/, "");
  return text === "" ? "" : `${text.replace(/\n+$/, "")}\n`;
}
