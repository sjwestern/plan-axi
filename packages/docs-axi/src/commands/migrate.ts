import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, flagStr, parseArgs, type CmdSpec } from "../args.js";
import { cmp, normalizeEol, readText, toPosix, writeText } from "../fsutil.js";
import { parseDoc, setFrontmatter, type FmValue } from "../frontmatter.js";
import { deriveTitleSummary, weakSummaries } from "../derive.js";
import { writeIndex } from "../indexgen.js";
import {
  ADR_FILE_RE,
  MAX_SUMMARY,
  SLUG_RE,
  allFiles,
  isAdrSection,
  isSectionIn,
  layoutGuideLines,
  loadDocs,
  nextAdrNumber,
  requireDocsDir,
  sectionOf,
  slugify,
  type Ctx,
} from "../model.js";

export const MIGRATE_SPEC: CmdSpec = {
  name: "migrate",
  flags: { "--apply": "boolean", "--plan": "string", "--force": "boolean", "--allow-weak-summaries": "boolean" },
  min: 0,
  max: 0,
  usage: "docs-axi migrate [--plan <file.json>] [--apply] [--force] [--allow-weak-summaries]",
  help: `usage: docs-axi migrate [--plan <file.json>] [--apply]
Move existing docs into configured sections, add missing frontmatter
(title, summary; ADR status), rewrite relative links between docs, regenerate the index.
Candidates: .md files under docs/ that are not in a section yet (indexed as "other"), or only mapped via [docs.map],
minus anything ignored by config.
Default is a dry run: prints the proposed moves (section is a filename heuristic - review it).
Configured section names are listed in the migration output.
  --plan <file>  dry run: write the proposal as JSON for review/editing.
                 If the file already exists it is NEVER overwritten: the dry run shows and
                 validates your edited plan instead. Pass --force to regenerate it.
                 with --apply: read the (edited) proposal instead of recomputing it.
  --allow-weak-summaries  apply even if summaries are weak (see below)
  --apply        perform the moves (git mv when possible), edits and reindex.
Weak summaries (equal/restating the title, "Status:"/"Note:" lead-ins, a prefix repeated across 3+ docs)
make --apply refuse: read each doc and write a real one-line description (what it covers, when to read it).
Plan entry fields: from, action (move|keep|ignore), section, to, title, summary.
  keep   = leave in place, add frontmatter, index under "Other" (e.g. standards referenced by path from AGENTS.md)
  ignore = not a doc; suggested for [docs] ignore, untouched
Not edited: references to old paths outside docs/ (AGENTS.md, code, CI); they are reported.
Commit first so the change is easy to review or undo.
`,
};

interface Entry {
  from: string;
  action: "move" | "keep" | "ignore";
  section: string;
  to: string;
  title: string;
  summary: string;
  needsSummary?: boolean;
}

const IGNORE_NAMES = /^(todos?|plans?|reports?|scratch|drafts?|archive|notes?|questions?|tmp)([-_.].*)?$/i;
const ARCH_RE = /(architecture|design|integration|sync|infra|deploy|conventions?|implementation|setup|runbook|ops|api)/i;
/** Referenced from agent/tool config by path (coding and planning standards): keep in place, index under Other. */
const KEEP_RE = /^(standards?|conventions?)$/i;
const ADR_DIR_RE = /^(adrs?|decisions?)$/i;

/** Ignore pattern for a skipped file: its ignorable top directory when there is one, else the file. */
function ignorePattern(from: string): string {
  const parts = from.split("/");
  const k = parts.slice(0, -1).findIndex((p) => IGNORE_NAMES.test(p));
  return k >= 0 ? `${parts.slice(0, k + 1).join("/")}/` : from;
}

function ignoreLine(ignores: Entry[]): string {
  const pats = [...new Set(ignores.map((e) => ignorePattern(e.from)))];
  return `[docs] ignore = [${pats.map((x) => JSON.stringify(x)).join(", ")}]`;
}

function suggestSection(path: string, layout: Ctx["config"]["layout"]): { action: "move" | "keep" | "ignore"; section: string } {
  const parts = path.split("/");
  const dirs = parts.slice(0, -1);
  const stem = (parts[parts.length - 1] as string).replace(/\.md$/i, "");
  if (dirs.some((p) => IGNORE_NAMES.test(p)) || IGNORE_NAMES.test(stem)) {
    return { action: "ignore", section: "" };
  }
  if (dirs.some((p) => KEEP_RE.test(p))) return { action: "keep", section: "other" };
  if (layout.adr !== undefined && dirs.some((p) => ADR_DIR_RE.test(p))) {
    return { action: "move", section: layout.adr };
  }
  const named = layout.sections.find((section) => dirs.includes(section.name));
  if (named) return { action: "move", section: named.name };
  if (layout.sections.some((section) => section.name === "architecture") && ARCH_RE.test(parts.join("/"))) {
    return { action: "move", section: "architecture" };
  }
  if (layout.sections.some((section) => section.name === "domain")) return { action: "move", section: "domain" };
  return { action: "move", section: "" };
}

function normName(file: string): string {
  const stem = file.replace(/\.md$/i, "");
  return `${slugify(stem) || "doc"}.md`;
}

export function buildProposal(ctx: Ctx): Entry[] {
  const files = allFiles(ctx).filter((f) => {
    const s = sectionOf(ctx, f);
    return s.section === "other" || s.mapped;
  });
  const docs = loadDocs(ctx);
  const taken = new Set(docs.filter((d) => !d.mapped).map((d) => d.path.toLowerCase()));
  const takenAdrNumbers = new Set(docs.filter((d) => isAdrSection(ctx.config.layout, d.section) && d.adrNumber !== undefined).map((d) => d.adrNumber as number));
  let adr = nextAdrNumber(docs);
  const out: Entry[] = [];
  for (const from of files) {
    const text = readText(join(ctx.docsDir, from));
    const parsed = parseDoc(text);
    const stem = (from.split("/").pop() as string).replace(/\.md$/i, "");
    const ts = deriveTitleSummary(parsed.body, stem);
    const title = typeof parsed.data["title"] === "string" ? (parsed.data["title"] as string) : ts.title;
    const hasSummary = typeof parsed.data["summary"] === "string" && parsed.data["summary"] !== "";
    const summary = hasSummary ? (parsed.data["summary"] as string) : ts.summary;
    const sug = suggestSection(from, ctx.config.layout);
    if (sug.action === "ignore") {
      out.push({ from, action: "ignore", section: "", to: "", title, summary });
      continue;
    }
    if (sug.action === "keep") {
      out.push({ from, action: "keep", section: "other", to: from, title, summary, ...(ts.needsSummary && !hasSummary ? { needsSummary: true } : {}) });
      continue;
    }
    if (sug.section === "") {
      out.push({ from, action: "move", section: "", to: "", title, summary, ...(ts.needsSummary && !hasSummary ? { needsSummary: true } : {}) });
      continue;
    }
    const dirs = from.split("/").slice(0, -1)
      .filter((d) => !(isAdrSection(ctx.config.layout, sug.section) && ADR_DIR_RE.test(d)))
      .map((d) => slugify(d) || d);
    let name = normName(from.split("/").pop() as string);
    let to: string;
    if (isAdrSection(ctx.config.layout, sug.section)) {
      const m = ADR_FILE_RE.exec(name);
      let n: string;
      if (m && !taken.has(`${sug.section}/${name}`) && !takenAdrNumbers.has(Number(m[1]))) {
        n = name;
        takenAdrNumbers.add(Number(m[1]));
      } else {
        while (takenAdrNumbers.has(adr) || taken.has(`${sug.section}/${String(adr).padStart(4, "0")}-${name.replace(/^\d+-/, "")}`.toLowerCase())) adr++;
        n = `${String(adr++).padStart(4, "0")}-${name.replace(/^\d+-/, "")}`;
        takenAdrNumbers.add(adr - 1);
      }
      to = `${sug.section}/${n}`;
    } else {
      if (dirs.length === 0 && name === `${sug.section}.md`) name = "overview.md";
      to = [sug.section, ...dirs, name].join("/");
    }
    taken.add(to.toLowerCase());
    out.push({
      from,
      action: "move",
      section: sug.section,
      to,
      title,
      summary,
      ...(ts.needsSummary && !hasSummary ? { needsSummary: true } : {}),
    });
  }
  return out.sort((a, b) => cmp(a.from, b.from));
}

function weakOf(entries: Entry[]): Map<string, string> {
  const live = entries.filter((e) => e.action !== "ignore");
  const w = weakSummaries(live.map((e) => ({ title: e.title, summary: e.summary, placeholder: e.needsSummary === true })));
  const out = new Map<string, string>();
  w.forEach((reason, i) => out.set((live[i] as Entry).from, reason));
  return out;
}

function validate(ctx: Ctx, entries: Entry[]): void {
  const targets = new Map<string, string>();
  const errs: string[] = [];
  for (const e of entries) {
    if (e.action === "ignore") continue;
    if (e.action !== "move" && e.action !== "keep") errs.push(`${e.from}: action must be move|keep|ignore`);
    if (!existsSync(join(ctx.docsDir, e.from))) errs.push(`${e.from}: source not found`);
    if (e.action === "keep") {
      if (e.summary.trim() === "" || e.summary.length > MAX_SUMMARY || /\n/.test(e.summary)) {
        errs.push(`${e.from}: summary must be one line, 1-${MAX_SUMMARY} chars`);
      }
      continue;
    }
    if (!isSectionIn(ctx.config.layout, e.section)) errs.push(`${e.from}: bad section "${e.section}"`);
    if (!e.to.startsWith(`${e.section}/`) || !e.to.toLowerCase().endsWith(".md")) {
      errs.push(`${e.from}: to must be ${e.section}/....md`);
    }
    const file = e.to.split("/").pop() as string;
    if (isAdrSection(ctx.config.layout, e.section) ? !ADR_FILE_RE.test(file) : !SLUG_RE.test(file.replace(/\.md$/i, ""))) {
      errs.push(`${e.from}: bad target file name ${file}`);
    }
    if (e.summary.trim() === "" || e.summary.length > MAX_SUMMARY || /\n/.test(e.summary)) {
      errs.push(`${e.from}: summary must be one line, 1-${MAX_SUMMARY} chars`);
    }
    const k = e.to.toLowerCase();
    if (targets.has(k)) errs.push(`${e.from}: target ${e.to} also used by ${targets.get(k)}`);
    targets.set(k, e.from);
    if (e.to !== e.from && existsSync(join(ctx.docsDir, e.to))) errs.push(`${e.from}: target ${e.to} already exists`);
  }
  if (errs.length > 0) {
    throw new AxiError(`invalid migration plan (${errs.length} problem(s))`, "VALIDATION_ERROR", errs.slice(0, 20));
  }
}

const LINK_RE = /(\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

function rewriteLinks(text: string, fromDir: string, toDir: string, moved: Map<string, string>, fileMoved: boolean): string {
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence;
        return line;
      }
      if (fence) return line;
      return line
        .split("`")
        .map((seg, i) => {
          if (i % 2 === 1) return seg;
          return seg.replace(LINK_RE, (all, pre: string, target: string, post: string) => {
            if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/")) return all;
            const m = /^([^#?]*)([#?].*)?$/.exec(target) as RegExpExecArray;
            let path = m[1] as string;
            const rest = m[2] ?? "";
            if (path === "") return all;
            try {
              path = decodeURIComponent(path);
            } catch {
              /* raw */
            }
            const abs = resolve(fromDir, path);
            const dest = moved.get(abs) ?? abs;
            if (!fileMoved && dest === abs) return all;
            if (!existsSync(abs) && !moved.has(abs)) return all;
            let rel = toPosix(relative(toDir, dest));
            if (!rel.startsWith(".")) rel = `./${rel}`;
            return `${pre}${rel.replace(/ /g, "%20")}${rest}${post}`;
          });
        })
        .join("`");
    })
    .join("\n");
}

/** Every .md under docs (ignored ones included, for link rewriting). Skips dot-entries and node_modules. */
function walkAllMd(dir: string, rel: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...walkAllMd(dir, next));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(resolve(dir, next));
  }
  return out.sort(cmp);
}

function gitMove(ctx: Ctx, from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(join(ctx.root, ".git"))) {
    try {
      execFileSync("git", ["mv", from, to], { cwd: ctx.root, stdio: "ignore" });
      return;
    } catch {
      /* untracked or other: plain rename */
    }
  }
  renameSync(from, to);
}

/** Fallback when git is unavailable: text-ish files, skipping .git, node_modules and build output. */
function walkRepo(root: string, rel: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    if ([".git", "node_modules", "bin", "obj", "dist"].includes(e.name)) continue;
    const next = rel === "" ? e.name : `${rel}/${e.name}`;
    if (e.isDirectory()) out.push(...walkRepo(root, next));
    else if (/\.(md|mdx|mdc|txt|ya?ml|json|toml|cs|ts|js|csproj)$/i.test(e.name)) out.push(next);
  }
  return out;
}

function externalRefs(ctx: Ctx, moves: Entry[]): { file: string; old: string }[] {
  let files: string[] = [];
  try {
    files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: ctx.root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .filter((f) => /\.(md|mdx|mdc|txt|ya?ml|json|toml|cs|ts|js|csproj)$/i.test(f));
  } catch {
    files = walkRepo(ctx.root, "");
  }
  const docsRelRoot = toPosix(relative(ctx.root, ctx.docsDir));
  const docsAbs = toPosix(ctx.docsDir) + "/";
  const olds = moves.map((e) => `${docsRelRoot}/${e.from}`);
  const hits: { file: string; old: string }[] = [];
  for (const f of files) {
    if (toPosix(resolve(ctx.root, f)).startsWith(docsAbs)) continue;
    let text: string;
    try {
      text = readFileSync(join(ctx.root, f), "utf8");
    } catch {
      continue;
    }
    for (const o of olds) if (text.includes(o)) hits.push({ file: f, old: o });
  }
  return hits.sort((a, b) => cmp(a.file, b.file) || cmp(a.old, b.old));
}

export function migrateCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(MIGRATE_SPEC, args);
  requireDocsDir(ctx);
  const apply = flagBool(p, "--apply");
  const planFile = flagStr(p, "--plan");
  const force = flagBool(p, "--force");
  const planExists = planFile !== undefined && existsSync(planFile);
  let entries: Entry[];
  if (planFile !== undefined && (apply || (planExists && !force))) {
    if (!existsSync(planFile)) throw new AxiError(`--plan not found: ${planFile}`, "NOT_FOUND");
    try {
      entries = JSON.parse(readFileSync(planFile, "utf8")) as Entry[];
    } catch (e) {
      throw new AxiError(`--plan is not valid JSON: ${(e as Error).message}`, "VALIDATION_ERROR");
    }
    if (!Array.isArray(entries)) throw new AxiError("--plan must be a JSON array", "VALIDATION_ERROR");
  } else {
    entries = buildProposal(ctx);
  }
  const moves = entries.filter((e) => e.action === "move");
  const keeps = entries.filter((e) => e.action === "keep");
  const ignores = entries.filter((e) => e.action === "ignore");

  if (!apply) {
    const reviewing = planFile !== undefined && planExists && !force;
    if (reviewing) validate(ctx, entries);
    else if (planFile !== undefined) writeFileSync(planFile, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
    if (entries.length === 0) return { migrate: "nothing to migrate (no unmanaged or mapped docs)" };
    const weak = weakOf(entries);
    const out: AxiStructuredOutput = {
      migrate: `${reviewing ? `dry run of ${planFile} (valid, not modified)` : "dry run"}: ${moves.length} move(s), ${keeps.length} keep in place (Other), ${ignores.length} suggested ignore(s), ${weak.size} weak summary(ies)`,
      proposal: entries.map((e) => ({
        from: e.from,
        action: e.action,
        section: e.section || "needs a section",
        to: e.to === "" ? "-" : e.to,
        title: e.title,
        summary: weak.get(e.from) ?? "ok",
      })),
    };
    if (ignores.length > 0) {
      out["ignore_suggestion"] = ignoreLine(ignores);
    }
    out["help"] = [
      reviewing
        ? `Plan is valid. Apply with \`docs-axi migrate --apply --plan ${planFile}\` (no further dry run needed)`
        : planFile === undefined
        ? "Run `docs-axi migrate --plan migration.json` to save the proposal, edit it, then `--apply --plan migration.json`"
        : `Edit ${planFile} (section, to, title, summary, action), then run \`docs-axi migrate --apply --plan ${planFile}\``,
      "Run `docs-axi migrate --apply` to apply the proposal as is. Commit first.",
      `Configured sections:\n${layoutGuideLines(ctx.config.layout)}`,
      ...(weak.size > 0
        ? [`${weak.size} weak summary(ies) (see summary column): read each doc and write a real one-line description before --apply, which refuses weak summaries`]
        : []),
    ];
    return out;
  }

  validate(ctx, entries);
  const weakNow = weakOf(entries);
  if (weakNow.size > 0 && !flagBool(p, "--allow-weak-summaries")) {
    throw new AxiError(`${weakNow.size} weak summary(ies); nothing was changed`, "VALIDATION_ERROR", [
      ...[...weakNow].slice(0, 15).map(([from, why]) => `${from}: ${why}`),
      "Read each doc and write a one-line summary (what it covers, when to read it) in the plan JSON, or pass --allow-weak-summaries",
    ]);
  }
  const moved = new Map<string, string>();
  for (const e of moves) moved.set(resolve(ctx.docsDir, e.from), resolve(ctx.docsDir, e.to));
  const refs = externalRefs(ctx, moves);

  // 1. snapshot every doc's text and original location before touching disk
  const origAbs = walkAllMd(ctx.docsDir, "");
  const texts = new Map<string, string>();
  for (const a of origAbs) texts.set(a, readText(a));

  // 2. move, then write rewritten content
  let linksTouched = 0;
  for (const e of moves) {
    const o = resolve(ctx.docsDir, e.from);
    gitMove(ctx, o, resolve(ctx.docsDir, e.to));
  }
  for (const a of origAbs) {
    const text = texts.get(a) as string;
    const newAbs = moved.get(a) ?? a;
    const entry = [...moves, ...keeps].find((e) => resolve(ctx.docsDir, e.from) === a);
    let next = rewriteLinks(text, dirname(a), dirname(newAbs), moved, moved.has(a));
    if (next !== text) linksTouched++;
    if (entry) {
      const parsed = parseDoc(next);
      const add: Record<string, FmValue | undefined> = {};
      if (typeof parsed.data["title"] !== "string" || parsed.data["title"] === "") add["title"] = entry.title;
      if (typeof parsed.data["summary"] !== "string" || parsed.data["summary"] === "") add["summary"] = entry.summary;
      if (isAdrSection(ctx.config.layout, entry.section) && !parsed.data["status"]) add["status"] = "accepted";
      if (Object.keys(add).length > 0) next = setFrontmatter(next, add);
    }
    if (next !== text) writeText(newAbs, next);
  }
  writeIndex(ctx, loadDocs(ctx));

  const out: AxiStructuredOutput = {
    migrate: `moved ${moves.length} doc(s), kept ${keeps.length} in place; rewrote links in ${linksTouched} file(s); index regenerated`,
    moved: moves.map((e) => ({ from: e.from, to: e.to })),
  };
  if (keeps.length > 0) out["kept_in_place"] = keeps.map((e) => e.from);
  if (ignores.length > 0) {
    out["not_moved"] = ignores.map((e) => e.from);
    out["ignore_suggestion"] = `${ignoreLine(ignores)} in .plan-axi.toml`;
  }
  if (refs.length > 0) {
    out["references_outside_docs"] = refs.slice(0, 50);
    out["warning"] = `${refs.length} reference(s) to old paths outside docs/ were NOT edited; update them (old -> new in the moved list)`;
  }
  out["help"] = ["Run `docs-axi check` and review `git diff`/`git status`"];
  return out;
}
