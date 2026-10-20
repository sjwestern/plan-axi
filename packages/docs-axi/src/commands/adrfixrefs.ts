import { relative, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, parseArgs, type CmdSpec } from "../args.js";
import { adrInfos, adrToken, type AdrInfo } from "../adrrefs.js";
import { readText, toPosix, writeText } from "../fsutil.js";
import { loadDocs, requireDocsDir, type Ctx } from "../model.js";
import { requireAdrSection } from "./write.js";
import { mdFiles } from "./adrrenumber.js";

export const FIXREFS_SPEC: CmdSpec = {
  name: "adr fix-refs",
  flags: { "--dry-run": "boolean" },
  min: 0,
  max: 0,
  usage: "docs-axi adr fix-refs [--dry-run]",
  help: `usage: docs-axi adr fix-refs [--dry-run]
Rewrite every ADR ref to the full form ADR-NNNN-slug in the docs dir, specs/changes/active and specs/changes/archived.
Fixes bare refs (ADR 7, ADR 0007, ADR-7, ADR-0007) and stale numbers or slugs when exactly one ADR matches.
Ambiguous or unknown refs are listed with candidates, never guessed (exit 1); use \`docs-axi adr renumber\` for duplicate numbers.
Code fences and inline code are left alone. Docs that reference a change are reported, not rewritten.
--dry-run prints the result without writing. Re-running on a clean repo is a no-op.`,
};

const REF_RE = /(?<![\w-])ADR(?:-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)|[ -](\d+)(?![\w]))/g;
const CHANGE_PATH_RE = /specs\/changes\/(?:active|archived)\/[a-z0-9][^\s`)\]'"<>]*/;
const CHANGE_REF_RE = /(?<![\w-])change:[a-z0-9][a-z0-9-]*/;
const pad = (n: number): string => String(n).padStart(4, "0");

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
  if (byNum.length === 1 && bySlug.length === 0) return { to: adrToken(byNum[0] as AdrInfo), candidates: [] };
  if (bySlug.length === 1 && byNum.length === 0) return { to: adrToken(bySlug[0] as AdrInfo), candidates: [] };
  return { candidates: [...byNum, ...bySlug].map(adrToken) };
}

/** Rewrite refs outside code; returns new text, fixed count and unresolved refs. */
function fixText(text: string, adrs: AdrInfo[], file: string): { out: string; fixed: number; unresolved: Unresolved[] } {
  const unresolved: Unresolved[] = [];
  let fixed = 0;
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
          if (r.to === undefined) {
            unresolved.push({ file, line: i + 1, ref: m[0], candidates: r.candidates });
            return m[0];
          }
          if (r.to !== m[0]) fixed++;
          return r.to;
        });
      })
      .join("");
  });
  return { out: lines.join("\n"), fixed, unresolved };
}

export function adrFixRefsCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(FIXREFS_SPEC, args);
  requireAdrSection(ctx, "adr fix-refs");
  requireDocsDir(ctx);
  const dry = flagBool(p, "--dry-run");
  const adrs = adrInfos(loadDocs(ctx));
  if (adrs.length === 0) throw new AxiError("No ADRs found", "NOT_FOUND", ["Run `docs-axi adr add` first"]);

  const areas: [string, string][] = [
    ["docs", ctx.docsDir],
    ["active", resolve(ctx.root, "specs/changes/active")],
    ["archived", resolve(ctx.root, "specs/changes/archived")],
  ];
  const fixedBy: Record<string, number> = { docs: 0, active: 0, archived: 0 };
  const unresolved: Unresolved[] = [];
  const docsToChanges: string[] = [];
  let filesChanged = 0;
  for (const [area, dir] of areas) {
    const files: string[] = [];
    mdFiles(dir, files);
    for (const f of files.sort()) {
      const rel = toPosix(relative(ctx.root, f));
      const text = readText(f);
      const r = fixText(text, adrs, rel);
      unresolved.push(...r.unresolved);
      if (area === "docs" && (CHANGE_PATH_RE.test(text) || CHANGE_REF_RE.test(text))) docsToChanges.push(rel);
      if (r.out !== text) {
        filesChanged++;
        fixedBy[area] = (fixedBy[area] ?? 0) + r.fixed;
        if (!dry) writeText(f, r.out);
      }
    }
  }
  const total = Object.values(fixedBy).reduce((a, b) => a + b, 0);
  const out: AxiStructuredOutput = {
    "fix-refs": total === 0 && unresolved.length === 0 ? "no-op" : `${dry ? "would fix" : "fixed"} ${total} ref(s) in ${filesChanged} file(s)`,
    fixed: fixedBy,
  };
  if (unresolved.length > 0) {
    process.exitCode = 1;
    out["unresolved"] = unresolved.map((u) => ({
      file: u.file,
      line: u.line,
      ref: u.ref,
      candidates: u.candidates.length > 0 ? u.candidates.join(" | ") : "(no matching ADR)",
    }));
  }
  if (docsToChanges.length > 0) out["docs_reference_changes"] = docsToChanges;
  const help: string[] = [];
  if (unresolved.some((u) => u.candidates.length > 1)) {
    help.push("Duplicate ADR numbers: run `docs-axi adr renumber <ref>` on one, then re-run fix-refs");
  }
  if (unresolved.length > 0) help.push("Edit unresolved refs by hand to ADR-NNNN-slug, then re-run");
  if (docsToChanges.length > 0) help.push("Docs must not reference changes: reword those docs by hand");
  help.push(dry ? "Run without --dry-run to write" : "Run `docs-axi check` to verify");
  out["help"] = help;
  return out;
}
