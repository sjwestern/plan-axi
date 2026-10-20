import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagStr, parseArgs, type CmdSpec } from "../args.js";
import { adrToken, findRefs } from "../adrrefs.js";
import { readText, toPosix, writeText } from "../fsutil.js";
import { setFrontmatter } from "../frontmatter.js";
import { writeIndex } from "../indexgen.js";
import { ADR_FILE_RE, loadDocs, requireDocsDir, type Ctx, type Doc } from "../model.js";
import { requireAdrSection } from "./write.js";

export const RENUMBER_SPEC: CmdSpec = {
  name: "adr renumber",
  flags: { "--to": "string" },
  min: 1,
  max: 1,
  usage: "docs-axi adr renumber <ref|path> [--to <n>]",
  help: `usage: docs-axi adr renumber <ref|path> [--to <n>]
Move an ADR to a new number and rewrite every ref to it.
<ref> is ADR-NNNN-slug (the slug tells clashing ADRs apart); <path> is the ADR file.
Default number: highest in the working tree, the local default branch and origin/<default> (no fetch), plus 1. Gaps are not filled.
--to <n> is rejected when that number is taken in any of those; a number held only on an unfetched remote is allowed.
Rewrites the file name, ADR-NNNN-slug tokens in the docs dir, specs/changes/active and specs/changes/archived, and the index.
Re-running after the move is a no-op.`,
};

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return undefined;
  }
}

/** Default branch name: origin/HEAD, else local main or master. */
export function defaultBranch(root: string): string | undefined {
  const head = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"])?.trim();
  if (head?.startsWith("origin/")) return head.slice("origin/".length);
  for (const b of ["main", "master"]) {
    if (git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`]) !== undefined) return b;
    if (git(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${b}`]) !== undefined) return b;
  }
  return undefined;
}

export interface BranchAdr {
  /** Branch ref the ADR was seen on, e.g. `main` or `origin/main`. */
  ref: string;
  number: number;
  /** Repo-relative posix path. */
  path: string;
}

/** ADR files on the local default branch and origin/<default> (git ls-tree, no network). */
export function defaultBranchAdrs(ctx: Ctx): BranchAdr[] {
  const adr = ctx.config.layout.adr;
  if (adr === undefined) return [];
  const branch = defaultBranch(ctx.root);
  if (branch === undefined) return [];
  const dir = `${toPosix(relative(ctx.root, ctx.docsDir))}/${adr}`;
  const out: BranchAdr[] = [];
  for (const ref of [branch, `origin/${branch}`]) {
    const listing = git(ctx.root, ["ls-tree", "-r", "--name-only", ref, "--", `${dir}/`]);
    if (listing === undefined) continue;
    for (const p of listing.split("\n")) {
      if (p === "") continue;
      const m = ADR_FILE_RE.exec(p.slice(p.lastIndexOf("/") + 1));
      if (m) out.push({ ref, number: Number(m[1]), path: p });
    }
  }
  return out;
}

const pad = (n: number): string => String(n).padStart(4, "0");

function mdFiles(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) mdFiles(p, out);
    else if (e.toLowerCase().endsWith(".md")) out.push(p);
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pickTarget(ctx: Ctx, input: string, docs: Doc[]): Doc | "moved" {
  const adrs = docs.filter((d) => d.adrNumber !== undefined);
  const ref = findRefs(input)[0];
  if (ref !== undefined && ref.token === input) {
    const hit = adrs.find((d) => d.adrNumber === ref.number && d.slug === `${pad(ref.number)}-${ref.slug}`);
    if (hit) return hit;
    // already renumbered: a single ADR with this slug at another number
    const moved = adrs.filter((d) => d.slug.replace(/^\d{4}-/, "") === ref.slug);
    if (moved.length === 1) return "moved";
    throw new AxiError(`No ADR matches ${input}`, "NOT_FOUND", [
      "Run `docs-axi adr list` to see ADR numbers and file names",
    ]);
  }
  let p = toPosix(input).replace(/^\.\//, "");
  const docsRel = toPosix(relative(ctx.root, ctx.docsDir));
  if (p.startsWith(`${docsRel}/`)) p = p.slice(docsRel.length + 1);
  const hit = adrs.find((d) => d.path === p || d.path === `${p}.md`);
  if (hit) return hit;
  throw new AxiError(`"${input}" is not an ADR ref (ADR-NNNN-slug) or ADR file path`, "VALIDATION_ERROR", [
    "Run `docs-axi adr list` to see ADR numbers and file names",
  ]);
}

export function adrRenumberCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(RENUMBER_SPEC, args);
  const section = requireAdrSection(ctx, "adr renumber");
  requireDocsDir(ctx);
  const toRaw = flagStr(p, "--to");
  let to: number | undefined;
  if (toRaw !== undefined) {
    if (!/^\d{1,4}$/.test(toRaw) || Number(toRaw) < 1) {
      throw new AxiError(`--to must be a number from 1 to 9999, got "${toRaw}"`, "VALIDATION_ERROR");
    }
    to = Number(toRaw);
  }
  const docs = loadDocs(ctx);
  const target = pickTarget(ctx, p.pos[0] as string, docs);
  if (target === "moved") {
    return { renumber: "no-op: already renumbered", help: ["Run `docs-axi check` to verify refs"] };
  }
  const oldNum = target.adrNumber as number;
  const slug = target.slug.replace(/^\d{4}-/, "");
  if (to === oldNum) return { renumber: `no-op: ${adrToken({ number: oldNum, slug })} already has number ${pad(to)}` };

  const onBranch = defaultBranchAdrs(ctx);
  const others = docs.filter((d) => d !== target && d.adrNumber !== undefined).map((d) => d.adrNumber as number);
  const taken = new Set<number>([...others, ...onBranch.map((b) => b.number)]);
  let newNum: number;
  if (to !== undefined) {
    if (taken.has(to)) {
      const where = onBranch.find((b) => b.number === to)?.ref ?? "the working tree";
      throw new AxiError(`ADR number ${pad(to)} is already used (${where})`, "CONFLICT", [
        "Omit --to to take the next free number",
      ]);
    }
    newNum = to;
  } else {
    newNum = Math.max(...taken, 0) + 1;
  }

  const oldToken = adrToken({ number: oldNum, slug });
  const newToken = adrToken({ number: newNum, slug });
  const newPath = `${section}/${pad(newNum)}-${slug}.md`;
  renameSync(join(ctx.docsDir, target.path), join(ctx.docsDir, newPath));

  const re = new RegExp(`(?<![\\w-])${escapeRe(oldToken)}(?![\\w]|-[a-z0-9])`, "g");
  const files: string[] = [];
  mdFiles(ctx.docsDir, files);
  mdFiles(resolve(ctx.root, "specs/changes/active"), files);
  mdFiles(resolve(ctx.root, "specs/changes/archived"), files);
  let changed = 0;
  for (const f of files) {
    const text = readText(f);
    const next = text.replace(re, newToken);
    if (next !== text) {
      writeText(f, next);
      changed++;
    }
  }

  // reciprocal supersede links (frontmatter holds bare numbers)
  const old = pad(oldNum);
  const neu = pad(newNum);
  for (const o of docs) {
    if (o === target || o.adrNumber === undefined) continue;
    const abs = join(ctx.docsDir, o.path);
    const fm: Record<string, string | string[]> = {};
    if (target.supersedes.includes(pad(o.adrNumber)) && o.supersededBy === old) {
      fm["superseded-by"] = neu;
    }
    if (target.supersededBy === pad(o.adrNumber) && o.supersedes.includes(old)) {
      fm["supersedes"] = o.supersedes.map((s) => (s === old ? neu : s));
    }
    if (Object.keys(fm).length > 0) {
      writeText(abs, setFrontmatter(readText(abs), fm));
      changed++;
    }
  }

  writeIndex(ctx, loadDocs(ctx));
  return {
    renumber: `${oldToken} -> ${newToken}`,
    file: `${section}/${target.slug}.md -> ${newPath}`,
    files_changed: changed,
    help: ["Run `docs-axi check` to verify refs and the index"],
  };
}
