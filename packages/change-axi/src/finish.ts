import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { archiveChange } from "./archive.js";
import type { Ctx } from "./change.js";
import { defaultBranch, git } from "./git.js";
import { statusRows, tryTreehouse } from "./start.js";

export interface FinishOptions {
  dryRun: boolean;
  skipDocsCheck: boolean;
  deleteBranch: boolean;
}

export interface FinishReport {
  archived: string;
  adrs: { path: string; action: string }[];
  untouched: string[];
  merged: string;
  returned: string;
  branchDeleted?: string;
  warnings?: string[];
  buildHint?: string;
}

/** Add guidance to fixable failures: restart the agent in the worktree and ask it to fix. */
function withAgentHint(e: unknown, slug: string): never {
  if (e instanceof AxiError && e.code === "VALIDATION_ERROR") {
    throw new AxiError(e.message, e.code, [
      ...e.suggestions,
      `To fix with the agent: run \`change-axi enter ${slug}\`, then ask it to fix the error above and commit`,
      `Then run \`change-axi finish ${slug}\` again`,
    ]);
  }
  throw e;
}

/** Dry-run readiness check from inside the change worktree (agent's last step). */
function checkOnBranch(ctx: Ctx, slug: string, base: string, o: FinishOptions): FinishReport {
  if (!o.dryRun) {
    throw new AxiError(`on branch "${slug}", finish runs on ${base}`, "VALIDATION_ERROR", [`From here use \`change-axi finish ${slug} --dry-run\` to check readiness`, "The human runs the real finish from the main checkout"]);
  }
  const dirty = git(ctx, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty !== "") throw new AxiError("uncommitted changes in the worktree", "VALIDATION_ERROR", dirty.split("\n").slice(0, 10).concat("Commit them first"));
  if (!isAncestorOf(ctx, base, slug)) {
    const behind = git(ctx, ["rev-list", "--count", `${slug}..${base}`], true);
    throw new AxiError(`${slug} is behind ${base}${behind ? ` by ${behind} commits` : ""}: rebase needed`, "VALIDATION_ERROR", [`Run \`git rebase ${base}\`, resolve conflicts, run the tests, then check again`]);
  }
  const archivedPaths = git(ctx, ["ls-tree", "-r", "--name-only", slug, "--", "specs/changes/archived"]).split("\n");
  const already = archivedPaths.some((f) => new RegExp(`^specs/changes/archived/\\d{4}-\\d{2}-\\d{2}-${slug}/`).test(f));
  let adrs: FinishReport["adrs"] = [];
  let untouched: string[] = [];
  if (!already) {
    const r = archiveChange(ctx, slug, { dryRun: true, commit: true, skipDocsCheck: o.skipDocsCheck });
    adrs = r.adrs;
    untouched = r.untouched;
  }
  return { archived: already ? "skipped (already archived)" : "dry run (would archive)", adrs, untouched, merged: `ready: ${slug} is up to date with ${base}; the human runs \`change-axi finish ${slug}\` from the main checkout`, returned: "n/a (run from main)" };
}

export function finishChange(ctx: Ctx, slug: string, o: FinishOptions): FinishReport {
  const base = defaultBranch(ctx);
  const current = git(ctx, ["branch", "--show-current"]);
  if (current === slug) return checkOnBranch(ctx, slug, base, o);
  if (current !== base) {
    throw new AxiError(`on branch "${current}", finish runs on ${base}`, "VALIDATION_ERROR", [`git switch ${base} (the main checkout)`, `Or, from the ${slug} worktree: \`change-axi finish ${slug} --dry-run\` to check readiness`]);
  }
  const dirty = git(ctx, ["status", "--porcelain", "--untracked-files=no"]);
  if (dirty !== "") throw new AxiError(`${base} has uncommitted changes`, "VALIDATION_ERROR", dirty.split("\n").slice(0, 10).concat("Commit or stash them first"));
  if (!git(ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], true)) {
    throw new AxiError(`branch "${slug}" does not exist`, "NOT_FOUND", [`Run \`change-axi start ${slug}\` first, or archive "${slug}" by hand`]);
  }
  const row = statusRows(ctx).find((r) => r.branch === slug);
  if (!row) {
    throw new AxiError(`no treehouse worktree on branch "${slug}"`, "NOT_FOUND", [
      `Archive on the ${slug} branch manually (\`change-axi archive ${slug} --commit\`), then merge it by hand`,
    ]);
  }
  const wt: Ctx = { root: row.path };
  const wtDirty = git(wt, ["status", "--porcelain", "--untracked-files=no"]);
  if (wtDirty !== "") {
    withAgentHint(new AxiError(`worktree ${row.path} has uncommitted changes`, "VALIDATION_ERROR", wtDirty.split("\n").slice(0, 10).concat("Commit them first")), slug);
  }
  if (!isAncestorOf(ctx, base, slug)) {
    withAgentHint(new AxiError(`${base} is not an ancestor of ${slug}`, "VALIDATION_ERROR", [`In the worktree: git rebase ${base}`]), slug);
  }

  const archivedPaths = git(ctx, ["ls-tree", "-r", "--name-only", slug, "--", "specs/changes/archived"]).split("\n");
  const alreadyArchived = archivedPaths.some((f) => new RegExp(`^specs/changes/archived/\\d{4}-\\d{2}-\\d{2}-${slug}/`).test(f));
  let archived = "skipped (already archived)";
  let adrs: FinishReport["adrs"] = [];
  let untouched: string[] = [];
  if (!alreadyArchived) {
    let r: ReturnType<typeof archiveChange>;
    try {
      r = archiveChange(wt, slug, { dryRun: o.dryRun, commit: true, skipDocsCheck: o.skipDocsCheck });
    } catch (e) {
      withAgentHint(e, slug);
    }
    archived = o.dryRun ? "dry run (would archive)" : "done";
    adrs = r.adrs;
    untouched = r.untouched;
  }

  if (o.dryRun) return { archived, adrs, untouched, merged: `planned: ff ${slug} into ${base}`, returned: `planned: ${row.path}`, ...(o.deleteBranch ? { branchDeleted: `planned: delete ${slug}` } : {}) };

  git(ctx, ["merge", "--ff-only", slug]);
  const merged = git(ctx, ["rev-parse", "--short", "HEAD"]);
  tryTreehouse(ctx, ["return", row.path]);
  let branchDeleted: string | undefined;
  const warnings: string[] = [];
  if (o.deleteBranch) {
    try {
      git(ctx, ["branch", "-d", slug]);
      branchDeleted = slug;
    } catch (e) {
      warnings.push(`could not delete ${slug}: ${(e as Error).message.replace(/^git branch failed: /, "")}; run git branch -d ${slug}`);
    }
  }
  const agents = join(ctx.root, "AGENTS.md");
  const hint = existsSync(agents) ? /`(npm (?:install && npm )?run build)`|^(npm run build)\s*$/m.exec(readFileSync(agents, "utf8")) : null;
  const cmd = hint ? (hint[1] ?? hint[2]) : undefined;
  return { archived, adrs, untouched, merged, returned: row.path, ...(branchDeleted ? { branchDeleted } : {}), ...(warnings.length > 0 ? { warnings } : {}), ...(cmd ? { buildHint: `Rebuild if the change touched code: ${cmd}` } : {}) };
}

function isAncestorOf(ctx: Ctx, ancestor: string, ref: string): boolean {
  try {
    git(ctx, ["merge-base", "--is-ancestor", ancestor, ref]);
    return true;
  } catch {
    return false;
  }
}
