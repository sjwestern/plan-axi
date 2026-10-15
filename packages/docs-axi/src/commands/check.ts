import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { AxiStructuredOutput } from "../types.js";
import { parseArgs, type CmdSpec } from "../args.js";
import { cmp, toPosix } from "../fsutil.js";
import { readmeState } from "../indexgen.js";
import {
  ADR_FILE_RE,
  ADR_STATUSES,
  MAX_SUMMARY,
  SLUG_RE,
  TAG_RE,
  loadDocs,
  requireDocsDir,
  type Ctx,
  docsRel,
  type Doc,
} from "../model.js";

export const CHECK_SPEC: CmdSpec = {
  name: "check",
  flags: {},
  min: 0,
  max: 0,
  usage: "docs-axi check",
  help: `usage: docs-axi check
Validate the docs folder. Exit 1 when problems are found.
Config: [docs] ignore / [docs.map] in .plan-axi.toml (repo) or ~/.config/plan-axi/config.toml (user).
Docs outside the layout are indexed under "Other" and not style-checked; style issues in mapped docs are warnings (exit 0).
Checks: frontmatter (title, summary, tags), file names, ADR numbers/status/supersession,
relative links resolve, index in sync.
`,
};

interface Problem {
  code: string;
  path: string;
  detail: string;
}

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function stripCode(body: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      continue;
    }
    if (!fence) out.push(line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

function checkLinks(ctx: Ctx, d: Doc, problems: Problem[]): void {
  const text = stripCode(d.parsed.body);
  const seen = new Set<string>();
  for (const m of text.matchAll(LINK_RE)) {
    let target = m[1] as string;
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue;
    target = target.split("#")[0]!.split("?")[0]!;
    if (target === "" || seen.has(target)) continue;
    seen.add(target);
    try {
      target = decodeURIComponent(target);
    } catch {
      /* keep raw */
    }
    const abs = target.startsWith("/")
      ? join(ctx.root, target)
      : resolve(dirname(join(ctx.docsDir, d.path)), target);
    if (!existsSync(abs)) {
      problems.push({ code: "BROKEN_LINK", path: d.path, detail: `link target not found: ${target}` });
    }
  }
}

export function checkCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(CHECK_SPEC, args);
  requireDocsDir(ctx);
  const docs = loadDocs(ctx);
  const problems: Problem[] = [];
  const warnings: Problem[] = [];
  const add = (code: string, path: string, detail: string): void => {
    problems.push({ code, path, detail });
  };
  // Docs placed via config [docs.map] are adopted as-is: style issues are warnings.
  const addFor = (d: Doc, code: string, path: string, detail: string): void => {
    (d.mapped ? warnings : problems).push({ code, path, detail });
  };

  const byNumber = new Map<number, Doc[]>();
  for (const d of docs) {
    for (const e of d.parsed.errors) add("FRONTMATTER_PARSE", d.path, e);
    // Docs outside the layout are indexed in place: no style checks, but dead links are reported (warnings).
    if (d.section === "other") {
      checkLinks(ctx, d, warnings);
      continue;
    }
    if (!d.parsed.hasFrontmatter && d.parsed.errors.length === 0) {
      addFor(d, "NO_FRONTMATTER", d.path, "add frontmatter with title and summary");
    }
    if (d.parsed.hasFrontmatter) {
      if (!d.title) addFor(d, "MISSING_TITLE", d.path, "frontmatter needs title");
      if (!d.summary) addFor(d, "MISSING_SUMMARY", d.path, "frontmatter needs a one-line summary");
      else if (d.summary.length > MAX_SUMMARY) {
        addFor(d, "SUMMARY_TOO_LONG", d.path, `${d.summary.length} chars (max ${MAX_SUMMARY})`);
      }
    }
    for (const t of d.tags) {
      if (!TAG_RE.test(t)) addFor(d, "BAD_TAG", d.path, `invalid tag "${t}"`);
    }
    const file = d.path.slice(d.path.lastIndexOf("/") + 1);
    if (d.mapped) {
      if (!SLUG_RE.test(d.slug)) addFor(d, "BAD_NAME", d.path, "file names are lowercase a-z, 0-9 and dashes");
    } else if (d.section === "decisions") {
      if (d.path.split("/").length !== 2 || !ADR_FILE_RE.test(file)) {
        add("ADR_BAD_NAME", d.path, "ADR files are decisions/NNNN-slug.md (4-digit number, lowercase slug)");
      }
      if (!d.status) add("ADR_MISSING_STATUS", d.path, `status: ${ADR_STATUSES.join(" | ")}`);
      else if (!(ADR_STATUSES as readonly string[]).includes(d.status)) {
        add("ADR_BAD_STATUS", d.path, `"${d.status}" is not one of ${ADR_STATUSES.join(", ")}`);
      }
      if (d.adrNumber !== undefined) {
        const list = byNumber.get(d.adrNumber) ?? [];
        list.push(d);
        byNumber.set(d.adrNumber, list);
      }
    } else if (!SLUG_RE.test(d.slug)) {
      add("BAD_NAME", d.path, "file names are lowercase a-z, 0-9 and dashes");
    }
    checkLinks(ctx, d, problems);
  }

  for (const [n, list] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    if (list.length > 1) {
      add(
        "ADR_DUPLICATE_NUMBER",
        list.map((d) => d.path).join(" , "),
        `number ${String(n).padStart(4, "0")} used ${list.length} times; rename one with the next free number and fix links`,
      );
    }
  }

  const adrByNum = new Map<string, Doc>();
  for (const d of docs) {
    if (d.adrNumber !== undefined) adrByNum.set(String(d.adrNumber).padStart(4, "0"), d);
  }
  for (const d of docs) {
    if (d.adrNumber === undefined) continue;
    const num = String(d.adrNumber).padStart(4, "0");
    if (d.supersededBy !== undefined) {
      const other = adrByNum.get(d.supersededBy);
      if (!other) add("SUPERSEDE_TARGET_MISSING", d.path, `superseded-by ${d.supersededBy} does not exist`);
      else if (!other.supersedes.includes(num)) {
        add("SUPERSEDE_MISMATCH", d.path, `${other.path} does not list supersedes ${num}`);
      }
      if (d.status !== "superseded") add("SUPERSEDE_STATUS", d.path, "has superseded-by but status is not superseded");
    } else if (d.status === "superseded") {
      add("SUPERSEDE_STATUS", d.path, "status superseded needs superseded-by");
    }
    for (const s of d.supersedes) {
      const other = adrByNum.get(s);
      if (!other) add("SUPERSEDE_TARGET_MISSING", d.path, `supersedes ${s} does not exist`);
      else if (other.supersededBy !== num) {
        add("SUPERSEDE_MISMATCH", d.path, `${other.path} does not list superseded-by ${num}`);
      }
    }
  }

  const st = readmeState(ctx, docs);
  if (st.actual === undefined) add("INDEX_MISSING", "README.md", "run `docs-axi index`");
  else if (st.actual !== st.expected) add("INDEX_STALE", "README.md", "index out of date; run `docs-axi index`");

  const order = (a: Problem, b: Problem): number =>
    cmp(a.path, b.path) || cmp(a.code, b.code) || cmp(a.detail, b.detail);
  problems.sort(order);
  warnings.sort(order);
  const cfg = ctx.config.sources.length > 0 ? ` config: ${ctx.config.sources.join("+")}` : "";
  if (problems.length === 0) {
    const out: AxiStructuredOutput = {
      check:
        warnings.length === 0
          ? `ok (${docs.length} docs, ${docsRel(ctx)})${cfg}`
          : `ok with ${warnings.length} warning(s) (${docs.length} docs, ${docsRel(ctx)})${cfg}`,
    };
    if (warnings.length > 0) {
      out["warnings"] = warnings;
      out["help"] = ["Warnings do not fail the check. Silence with [docs] ignore / [docs.map] in .plan-axi.toml"];
    }
    return out;
  }
  process.exitCode = 1;
  const help: string[] = [];
  if (problems.some((p) => p.code === "INDEX_STALE" || p.code === "INDEX_MISSING")) {
    help.push("Run `docs-axi index` to regenerate the index");
  }
  if (problems.some((p) => p.code === "MISSING_SUMMARY" || p.code === "MISSING_TITLE")) {
    help.push('Run `docs-axi update <path> --title "<t>" --summary "<one line>"`');
  }
  const out: AxiStructuredOutput = {
    check: `${problems.length} problem(s) in ${docs.length} docs${cfg}`,
    problems,
  };
  if (warnings.length > 0) out["warnings"] = warnings;
  if (help.length > 0) out["help"] = help;
  return out;
}
