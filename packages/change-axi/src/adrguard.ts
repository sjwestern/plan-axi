import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { adrInfos, adrToken, checkRefs, type AdrInfo } from "docs-axi/lib/adrrefs";
import { loadDocs } from "docs-axi/lib/model";
import { readText, normalizeEol } from "docs-axi/lib/fsutil";
import { loadSourceAdrs } from "./adrsources.js";
import { getDocsConfig, type Ctx } from "./change.js";
import { defaultBranch, git } from "./git.js";

export interface AdrGuardResult {
  /** One line per problem, naming the files. */
  errors: string[];
  /** At most two commands. */
  help: string[];
}

const ADR_NAME_RE = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** ADR file paths (repo-relative) on a ref, or undefined when the ref does not exist. */
function adrPathsOn(ctx: Ctx, ref: string, adrDir: string): string[] | undefined {
  if (!git(ctx, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], true)) return undefined;
  return git(ctx, ["ls-tree", "-r", "--name-only", ref, "--", adrDir], true).split("\n").filter(Boolean);
}

const numOf = (path: string): number | undefined => {
  const m = ADR_NAME_RE.exec(path.slice(path.lastIndexOf("/") + 1));
  return m ? Number(m[1]) : undefined;
};

/**
 * ADR guard: duplicate numbers in the tree, numbers used by a different file on the default branch
 * (local and origin/<default>, no fetch), and unresolved or bare ADR refs in docs and plans.
 */
export function checkAdrs(ctx: Ctx): AdrGuardResult {
  const errors: string[] = [];
  const config = getDocsConfig(ctx);
  const docsDir = resolve(ctx.root, config.layout.dir);
  if (!existsSync(docsDir)) return { errors, help: [] };
  const docs = loadDocs({ root: ctx.root, docsDir, config });
  const adrs: AdrInfo[] = adrInfos(docs);
  const adrSection = config.layout.adr;
  let clash = false;
  let refs = false;

  // duplicates in this tree
  const byNum = new Map<number, AdrInfo[]>();
  for (const a of adrs) byNum.set(a.number, [...(byNum.get(a.number) ?? []), a]);
  for (const [n, list] of [...byNum].sort((a, b) => a[0] - b[0])) {
    if (list.length < 2) continue;
    clash = true;
    errors.push(`ADR_DUPLICATE_NUMBER: ${String(n).padStart(4, "0")} used by ${list.map((a) => `${config.layout.dir}/${a.path}`).join(" , ")}`);
  }

  // numbers used by another file on the default branch
  let behind = false;
  if (adrSection) {
    const base = defaultBranch(ctx);
    const adrDir = `${config.layout.dir}/${adrSection}`;
    const seen = new Set<string>();
    for (const ref of [base, `origin/${base}`]) {
      const onRef = adrPathsOn(ctx, ref, adrDir);
      if (!onRef) continue;
      if (ref !== base && Number(git(ctx, ["rev-list", "--count", `${base}..${ref}`], true) || "0") > 0) behind = true;
      for (const a of adrs) {
        const full = `${config.layout.dir}/${a.path}`;
        const other = onRef.filter((p) => numOf(p) === a.number);
        if (other.length === 0 || other.includes(full) || seen.has(full)) continue;
        seen.add(full);
        clash = true;
        errors.push(`ADR_NUMBER_TAKEN: ${full} uses ${String(a.number).padStart(4, "0")}, already used by ${other.join(" , ")} on ${ref}; renumber ${full}`);
      }
    }
  }

  // refs in docs bodies and active plans
  const texts: { name: string; text: string }[] = docs.map((d) => ({ name: `${config.layout.dir}/${d.path}`, text: d.parsed.body }));
  const active = join(ctx.root, "specs", "changes", "active");
  if (existsSync(active)) {
    for (const s of readdirSync(active)) {
      const dir = join(active, s);
      for (const f of existsSync(dir) ? readdirSync(dir) : []) {
        if (f.endsWith(".md")) texts.push({ name: `specs/changes/active/${s}/${f}`, text: normalizeEol(readText(join(dir, f))) });
      }
    }
  }
  const refAdrs = [...adrs, ...loadSourceAdrs(ctx.root).adrs];
  for (const t of texts) {
    for (const p of checkRefs(t.text, refAdrs, { qualified: true })) {
      refs = true;
      errors.push(`${p.code}: ${t.name}: ${p.detail}`);
    }
  }

  const help: string[] = [];
  if (clash) {
    const first = errors.find((e) => e.startsWith("ADR_NUMBER_TAKEN"));
    const file = first ? /renumber (\S+)$/.exec(first)?.[1] : undefined;
    const target = file ? adrs.find((a) => `${config.layout.dir}/${a.path}` === file) : [...byNum.values()].find((l) => l.length > 1)?.at(-1);
    help.push(`docs-axi adr renumber ${target ? adrToken(target) : "<ref>"}`);
  }
  if (refs) help.push("docs-axi adr fix-refs");
  if (help.length > 0 && behind) help.unshift("git pull --rebase");
  return { errors, help: help.slice(0, 2) };
}

/** Throw VALIDATION_ERROR when the guard fails; `retry` is the command to rerun after the fix. */
export function guardAdrs(ctx: Ctx, retry: string): void {
  const r = checkAdrs(ctx);
  if (r.errors.length === 0) return;
  throw new AxiError(`ADR check failed: ${r.errors.length} problem${r.errors.length === 1 ? "" : "s"}`, "VALIDATION_ERROR", [...r.errors, ...r.help, `Then retry: ${retry}`]);
}
