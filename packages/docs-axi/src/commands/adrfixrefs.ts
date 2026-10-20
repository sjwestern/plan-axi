import { execFileSync } from "node:child_process";
import { relative, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, parseArgs, type CmdSpec } from "../args.js";
import { adrInfos, adrToken, checkRefs, type AdrInfo } from "../adrrefs.js";
import { readText, toPosix, writeText } from "../fsutil.js";
import { loadDocs, requireDocsDir, type Ctx } from "../model.js";
import { requireAdrSection } from "./write.js";
import { mdFiles } from "./adrrenumber.js";

export const FIXREFS_SPEC: CmdSpec = {
  name: "adr fix-refs",
  flags: { "--dry-run": "boolean", "--force": "boolean" },
  min: 0,
  max: 0,
  usage: "docs-axi adr fix-refs [--dry-run] [--force]",
  help: `usage: docs-axi adr fix-refs [--dry-run] [--force]
Rewrite ADR refs to the full form ADR-NNNN-slug in the docs dir, specs/changes/active and specs/changes/archived.
Fixes bare refs (ADR 7, ADR 0007, ADR-7, ADR-0007) when exactly one ADR has that number, and full refs whose slug
names exactly one ADR under a different number. A full ref with a known number but an unknown slug is listed, not rewritten.
Ambiguous or unknown refs are listed with candidates, never guessed (exit 1); use \`docs-axi adr renumber\` for duplicate numbers.
Bare refs on a line that describes ref forms (bare, e.g., for example, for instance, such as, double quotes) are listed under "review", not rewritten.
Code fences and inline code are left alone. Docs that reference a change are reported, not rewritten.
Every rewrite is listed as file:line before -> after. After writing, the result is re-scanned; leftover problems exit 1.
--dry-run prints the result without writing. Writing refuses files with uncommitted changes unless --force.
Re-running on a clean repo is a no-op.`,
};

const REF_RE = /(?<![\w-])ADR(?:-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)|[ -](\d+)(?![\w]))/g;
const CHANGE_PATH_RE = /specs\/changes\/(?:active|archived)\/[a-z0-9][^\s`)\]'"<>]*/;
const CHANGE_REF_RE = /(?<![\w-])change:[a-z0-9][a-z0-9-]*/;
const pad = (n: number): string => String(n).padStart(4, "0");

interface Change {
  file: string;
  line: number;
  from: string;
  to: string;
}

const DESCRIBES_FORM_RE = /\b(bare|e\.g\.|for example|for instance|such as)\b|["\u201c\u201d]/i;

interface Unresolved {
  file: string;
  line: number;
  ref: string;
  candidates: string[];
}

function resolveToken(m: RegExpExecArray, adrs: AdrInfo[]): { to?: string; candidates: string[] } {
  if (m[3] !== undefined) {
    const hits = adrs.filter((a) => a.number === Number(m[3]));
    return hits.length === 1 ? { to: adrToken(hits[0] as AdrInfo), candidates: [] } : { candidates: hits.map(adrToken) };
  }
  const num = Number(m[1]);
  const slug = m[2] as string;
  const byNum = adrs.filter((a) => a.number === num);
  const bySlug = adrs.filter((a) => a.slug === slug);
  const exact = byNum.find((a) => a.slug === slug);
  if (exact) return { to: adrToken(exact), candidates: [] };
  if (bySlug.length === 1 && byNum.length === 0) return { to: adrToken(bySlug[0] as AdrInfo), candidates: [] };
  return { candidates: [...byNum, ...bySlug].map(adrToken) };
}

/** Rewrite refs outside code; returns new text, fixed count and unresolved refs. */
function fixText(
  text: string,
  adrs: AdrInfo[],
  file: string,
): { out: string; changes: Change[]; unresolved: Unresolved[]; review: Unresolved[] } {
  const unresolved: Unresolved[] = [];
  const review: Unresolved[] = [];
  const changes: Change[] = [];
  let fence = false;
  const lines = text.split("\n").map((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      return line;
    }
    if (fence) return line;
    return line
      .split(/(`[^`]*`)/)
      .map((seg) => {
        if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 1) return seg;
        return seg.replace(REF_RE, (...a) => {
          const m = a.slice(0, a.length - 2) as unknown as RegExpExecArray;
          const r = resolveToken(m, adrs);
          if (r.to !== undefined && r.to !== m[0] && m[3] !== undefined && DESCRIBES_FORM_RE.test(line)) {
            review.push({ file, line: i + 1, ref: m[0], candidates: [r.to] });
            return m[0];
          }
          if (r.to === undefined) {
            unresolved.push({ file, line: i + 1, ref: m[0], candidates: r.candidates });
            return m[0];
          }
          if (r.to !== m[0]) changes.push({ file, line: i + 1, from: m[0], to: r.to });
          return r.to;
        });
      })
      .join("");
  });
  return { out: lines.join("\n"), changes, unresolved, review };
}

function dirtyFiles(root: string, files: string[]): string[] {
  if (files.length === 0) return [];
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", ...files], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").filter((l) => l !== "").map((l) => l.slice(3));
  } catch {
    return []; // not a git repo: nothing to protect
  }
}

/** Token as reported by checkRefs: text before the first ": " (full refs) or the quoted bare form. */
function problemToken(detail: string): string {
  const q = /^"([^"]+)"/.exec(detail);
  return q ? (q[1] as string) : detail.slice(0, detail.indexOf(":"));
}

export function adrFixRefsCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(FIXREFS_SPEC, args);
  requireAdrSection(ctx, "adr fix-refs");
  requireDocsDir(ctx);
  const dry = flagBool(p, "--dry-run");
  const force = flagBool(p, "--force");
  const adrs = adrInfos(loadDocs(ctx));
  if (adrs.length === 0) throw new AxiError("No ADRs found", "NOT_FOUND", ["Run `docs-axi adr add` first"]);

  const areas: [string, string][] = [
    ["docs", ctx.docsDir],
    ["active", resolve(ctx.root, "specs/changes/active")],
    ["archived", resolve(ctx.root, "specs/changes/archived")],
  ];
  const fixedBy: Record<string, number> = { docs: 0, active: 0, archived: 0 };
  const unresolved: Unresolved[] = [];
  const review: Unresolved[] = [];
  const changes: Change[] = [];
  const docsToChanges: string[] = [];
  const writes: { abs: string; rel: string; text: string; out: string; accounted: Set<string> }[] = [];
  for (const [area, dir] of areas) {
    const files: string[] = [];
    mdFiles(dir, files);
    for (const f of files.sort()) {
      const rel = toPosix(relative(ctx.root, f));
      const text = readText(f);
      const r = fixText(text, adrs, rel);
      unresolved.push(...r.unresolved);
      review.push(...r.review);
      changes.push(...r.changes);
      if (area === "docs" && (CHANGE_PATH_RE.test(text) || CHANGE_REF_RE.test(text))) docsToChanges.push(rel);
      if (r.out !== text) {
        fixedBy[area] = (fixedBy[area] ?? 0) + r.changes.length;
        const accounted = new Set([...r.unresolved, ...r.review].map((u) => u.ref));
        writes.push({ abs: f, rel, text, out: r.out, accounted });
      }
    }
  }

  if (!dry && !force) {
    const dirty = dirtyFiles(ctx.root, writes.map((w) => w.rel));
    if (dirty.length > 0) {
      throw new AxiError(`${dirty.length} file(s) to rewrite have uncommitted changes`, "CONFLICT", [
        `Commit or stash: ${dirty.slice(0, 5).join(", ")}${dirty.length > 5 ? ", ..." : ""}`,
        "Or re-run with --force, or use --dry-run to preview",
      ]);
    }
  }
  if (!dry) for (const w of writes) writeText(w.abs, w.out);

  // verify: re-scan the result; only refs already listed as unresolved/review may remain
  const verifyFailed: { file: string; problem: string }[] = [];
  for (const w of writes) {
    for (const prob of checkRefs(w.out, adrs)) {
      if (!w.accounted.has(problemToken(prob.detail))) verifyFailed.push({ file: w.rel, problem: prob.detail });
    }
  }

  const total = changes.length;
  const out: AxiStructuredOutput = {
    "fix-refs":
      total === 0 && unresolved.length === 0 && review.length === 0
        ? "no-op"
        : `${dry ? "would fix" : "fixed"} ${total} ref(s) in ${writes.length} file(s)`,
    fixed: fixedBy,
  };
  if (changes.length > 0) out["changes"] = changes.map((c) => `${c.file}:${c.line}  ${c.from} -> ${c.to}`);
  if (unresolved.length > 0) {
    out["unresolved"] = unresolved.map((u) => ({
      file: u.file,
      line: u.line,
      ref: u.ref,
      candidates: u.candidates.length > 0 ? u.candidates.join(" | ") : "(no matching ADR)",
    }));
  }
  if (review.length > 0) {
    out["review"] = review.map((u) => ({ file: u.file, line: u.line, ref: u.ref, would_become: u.candidates.join(" | ") }));
  }
  if (verifyFailed.length > 0) out["verify_failed"] = verifyFailed;
  if (unresolved.length > 0 || review.length > 0 || verifyFailed.length > 0) process.exitCode = 1;
  if (docsToChanges.length > 0) out["docs_reference_changes"] = docsToChanges;
  const help: string[] = [];
  if (unresolved.some((u) => u.candidates.length > 1)) {
    help.push("Duplicate ADR numbers: run `docs-axi adr renumber <ref>` on one, then re-run fix-refs");
  }
  if (unresolved.length > 0) help.push("Edit unresolved refs by hand to ADR-NNNN-slug, then re-run");
  if (review.length > 0) help.push("Review lines describe ref forms: wrap examples in backticks, or write the full ref by hand");
  if (docsToChanges.length > 0) help.push("Docs must not reference changes: reword those docs by hand");
  help.push(dry ? "Run without --dry-run to write" : "Run `docs-axi check` to verify");
  out["help"] = help;
  return out;
}
