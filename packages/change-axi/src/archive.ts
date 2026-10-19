import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import type { Layout } from "docs-axi/lib/config";
import { readText, writeText } from "docs-axi/lib/fsutil";
import { parseDoc, setFrontmatter } from "docs-axi/lib/frontmatter";
import { writeIndex } from "docs-axi/lib/indexgen";
import { loadDocs } from "docs-axi/lib/model";
import { splitDoc } from "docs-axi/lib/sectionedit";
import { findSectionOrUndefined, sectionText } from "docs-axi/lib/sections";
import { archivedDir, changeDir, getDocsConfig, type Ctx } from "./change.js";
import { checkChange } from "./check.js";
import { commit, defaultBranch, firstCommitOf, git, isAncestor } from "./git.js";
import { listTasks, runTasks } from "./tasks.js";

export interface DocsImpact {
  path: string;
  adr: boolean;
  removal: boolean;
}

/** Markdown paths named in the proposal's "Docs impact" section. */
export function parseDocsImpact(proposal: string, layout: Layout): { none: boolean; docs: DocsImpact[] } {
  const d = splitDoc(proposal);
  const s = findSectionOrUndefined(d.secs.filter((x) => x.level === 2), "Docs impact");
  const text = s ? sectionText(d.lines, s, true) : "";
  const none = /^\s*(-\s*)?None\b/im.test(text) && !/`[^`]+\.md`/.test(text);
  const docs: DocsImpact[] = [];
  for (const line of text.split("\n")) {
    const removal = /\b(delete|remove|drop)\b/i.test(line);
    for (const m of line.matchAll(/`([^`\s]+\.md)`/g)) {
      const path = (m[1] as string).replace(/^\.\//, "").replace(/\\/g, "/");
      const adrPath = layout.adr
        ? new RegExp(`^${escapeRegex(layout.dir)}/${escapeRegex(layout.adr)}/\\d{4}-.+\\.md$`).test(path)
        : false;
      if (!docs.some((x) => x.path === path)) docs.push({ path, adr: adrPath, removal });
    }
  }
  return { none, docs };
}

export interface ArchiveOptions {
  dryRun: boolean;
  commit: boolean;
  skipDocsCheck: boolean;
}

export interface ArchiveReport {
  mode: string;
  target: string;
  adrs: { path: string; action: string }[];
  untouched: string[];
  /** `file:line` references to the old active path (reported, never rewritten). */
  references?: string[];
  commit?: string;
  already?: boolean;
  next?: string[];
}

export function archiveChange(ctx: Ctx, slug: string, o: ArchiveOptions): ArchiveReport {
  const config = getDocsConfig(ctx);
  const layout = config.layout;
  const active = changeDir(ctx, slug);
  const arch = archivedDir(ctx);
  const done = existsSync(arch) ? readdirSync(arch).find((d) => /^\d{4}-\d{2}-\d{2}-/.test(d) && d.slice(11) === slug) : undefined;
  if (!existsSync(active) && done) {
    if (!o.dryRun) ensureBacklogDone(ctx, slug);
    return { mode: "already archived", target: `specs/changes/archived/${done}`, adrs: [], untouched: [], already: true };
  }
  if (!existsSync(active)) throw new AxiError(`change "${slug}" not found in specs/changes/active/`, "NOT_FOUND");

  // where
  const base = defaultBranch(ctx);
  const current = git(ctx, ["branch", "--show-current"]);
  let mode: string;
  if (current === slug) mode = "branch";
  else if (current === base) {
    if (!git(ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], true) || !isAncestor(ctx, slug)) {
      throw new AxiError(`on ${base} but branch "${slug}" is not merged`, "VALIDATION_ERROR", [`Merge ${slug} first, or run archive on the ${slug} branch`]);
    }
    mode = "main (after merge)";
  } else {
    throw new AxiError(`on branch "${current}"`, "VALIDATION_ERROR", [`Run archive on branch ${slug} (preferred) or on ${base} after merging ${slug}`]);
  }

  const dirty = git(ctx, ["status", "--porcelain", "--", "specs", layout.dir, "backlog.md"]);
  if (dirty !== "") throw new AxiError(`uncommitted changes in specs/, ${layout.dir}/ or backlog.md`, "VALIDATION_ERROR", dirty.split("\n").slice(0, 10).concat("Commit them first"));

  const tasks = listTasks(ctx.root, `specs/changes/active/${slug}/tasks.md`);
  const open = tasks.filter((t) => t.state !== "done");
  if (open.length > 0) {
    throw new AxiError(`${open.length} task(s) not done: ${open.map((t) => `${t.id} (${t.state})`).join(", ")}`, "VALIDATION_ERROR", [
      "Finish them, or drop with `tasks-axi rm <id> --file specs/changes/active/<slug>/tasks.md`",
    ]);
  }
  const chk = checkChange(ctx, slug);
  const errs = chk.errors.filter((e) => !e.startsWith("SLUG_DONE"));
  if (errs.length > 0) throw new AxiError("plan check failed", "VALIDATION_ERROR", errs.concat(`Run \`change-axi check ${slug}\``));

  // docs impact
  const proposalPath = join(active, "proposal.md");
  const impact = parseDocsImpact(readText(proposalPath), layout);
  if (!impact.none && impact.docs.length === 0) {
    throw new AxiError('proposal "Docs impact" names no .md paths and is not "None - <reason>"', "VALIDATION_ERROR", [`List docs as \`${layout.dir}/x.md\` in backticks, or write \`None - <reason>\``]);
  }
  const planCommit = firstCommitOf(ctx, `specs/changes/active/${slug}/proposal.md`);
  if (!planCommit) throw new AxiError("proposal.md is not committed", "VALIDATION_ERROR", ["Commit the plan first"]);
  const touched = new Set(git(ctx, ["diff", "--name-only", `${planCommit}..HEAD`]).split("\n").filter(Boolean));
  const untouched: string[] = [];
  for (const d of impact.docs) {
    if (d.removal) continue;
    if (!existsSync(join(ctx.root, d.path))) throw new AxiError(`Docs impact lists ${d.path} but it does not exist`, "VALIDATION_ERROR");
    if (!d.adr && !touched.has(d.path)) untouched.push(d.path);
  }
  if (untouched.length > 0 && !o.skipDocsCheck) {
    throw new AxiError(`${untouched.length} doc(s) in Docs impact not changed since the plan commit`, "VALIDATION_ERROR", [
      ...untouched,
      "Update them, or pass --skip-docs-check and say why in the commit message",
    ]);
  }

  // ADRs
  const adrs: ArchiveReport["adrs"] = [];
  for (const d of impact.docs.filter((x) => x.adr && !x.removal)) {
    const fm = parseDoc(readText(join(ctx.root, d.path))).data["status"];
    adrs.push({ path: d.path, action: fm === "proposed" ? "accept" : `keep (${String(fm)})` });
  }

  const date = new Date().toLocaleDateString("sv-SE");
  const targetRel = `specs/changes/archived/${date}-${slug}`;
  const target = join(ctx.root, targetRel);
  if (existsSync(target)) throw new AxiError(`${targetRel} already exists`, "VALIDATION_ERROR");
  const report: ArchiveReport = { mode, target: targetRel, adrs, untouched };
  if (mode === "branch") report.next = [`from the main checkout: change-axi finish ${slug}`];
  const oldRel = `specs/changes/active/${slug}`;
  const scan = (): string[] => {
    const out = git(ctx, ["grep", "-n", "-I", "-F", "-e", oldRel, "--", ".", `:!${oldRel}`, `:!${targetRel}`], true);
    return out === "" ? [] : out.split("\n").map((l) => l.split(":").slice(0, 2).join(":"));
  };
  if (o.dryRun) {
    const refs = scan();
    if (refs.length > 0) report.references = refs;
    return report;
  }

  // apply
  const accepted = adrs.filter((a) => a.action === "accept");
  if (accepted.length > 0) {
    for (const a of accepted) {
      const abs = join(ctx.root, a.path);
      writeText(abs, setFrontmatter(readText(abs), { status: "accepted" }));
      a.action = "accepted";
    }
    const dctx = { root: ctx.root, docsDir: resolve(ctx.root, layout.dir), config };
    writeIndex(dctx, loadDocs(dctx));
  }
  mkdirSync(dirname(target), { recursive: true });
  git(ctx, ["mv", `specs/changes/active/${slug}`, targetRel]);
  ensureBacklogDone(ctx, slug);
  const refs = scan();
  if (refs.length > 0) report.references = refs;
  if (o.commit) {
    git(ctx, ["add", "--", "specs", layout.dir, "backlog.md"]);
    try {
      commit(ctx, "archive change", slug);
    } catch (e) {
      if (e instanceof AxiError) throw new AxiError(e.message, e.code, [...(e.suggestions ?? []), "Changes are staged; fix the hook problem and run git commit"]);
      throw e;
    }
    report.commit = git(ctx, ["rev-parse", "--short", "HEAD"]);
  }
  return report;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureBacklogDone(ctx: Ctx, slug: string): void {
  if (!existsSync(join(ctx.root, "backlog.md"))) return;
  const t = listTasks(ctx.root, "backlog.md").find((x) => x.id === slug);
  if (t && t.state !== "done") runTasks(ctx.root, ["done", slug, "--file", "backlog.md"]);
}
