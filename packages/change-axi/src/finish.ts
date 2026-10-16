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
}

export interface FinishReport {
  archived: string;
  adrs: { path: string; action: string }[];
  untouched: string[];
  merged: string;
  returned: string;
  buildHint?: string;
}

export function finishChange(ctx: Ctx, slug: string, o: FinishOptions): FinishReport {
  const base = defaultBranch(ctx);
  const current = git(ctx, ["branch", "--show-current"]);
  if (current !== base) {
    throw new AxiError(`on branch "${current}", finish runs on ${base}`, "VALIDATION_ERROR", [`git switch ${base} (the main checkout)`]);
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
  if (wtDirty !== "") throw new AxiError(`worktree ${row.path} has uncommitted changes`, "VALIDATION_ERROR", wtDirty.split("\n").slice(0, 10).concat("Commit them first"));
  if (!isAncestorOf(ctx, base, slug)) {
    throw new AxiError(`${base} is not an ancestor of ${slug}`, "VALIDATION_ERROR", [`In the worktree: git rebase ${base}`]);
  }

  const archivedPaths = git(ctx, ["ls-tree", "-r", "--name-only", slug, "--", "specs/changes/archived"]).split("\n");
  const alreadyArchived = archivedPaths.some((f) => new RegExp(`^specs/changes/archived/\\d{4}-\\d{2}-\\d{2}-${slug}/`).test(f));
  let archived = "skipped (already archived)";
  let adrs: FinishReport["adrs"] = [];
  let untouched: string[] = [];
  if (!alreadyArchived) {
    const r = archiveChange(wt, slug, { dryRun: o.dryRun, commit: true, skipDocsCheck: o.skipDocsCheck });
    archived = o.dryRun ? "dry run (would archive)" : "done";
    adrs = r.adrs;
    untouched = r.untouched;
  }

  if (o.dryRun) return { archived, adrs, untouched, merged: `planned: ff ${slug} into ${base}`, returned: `planned: ${row.path}` };

  git(ctx, ["merge", "--ff-only", slug]);
  const merged = git(ctx, ["rev-parse", "--short", "HEAD"]);
  tryTreehouse(ctx, ["return", row.path]);
  const agents = join(ctx.root, "AGENTS.md");
  const hint = existsSync(agents) ? /`(npm (?:install && npm )?run build)`|^(npm run build)\s*$/m.exec(readFileSync(agents, "utf8")) : null;
  const cmd = hint ? (hint[1] ?? hint[2]) : undefined;
  return { archived, adrs, untouched, merged, returned: row.path, ...(cmd ? { buildHint: `Rebuild if the change touched code: ${cmd}` } : {}) };
}

function isAncestorOf(ctx: Ctx, ancestor: string, ref: string): boolean {
  try {
    git(ctx, ["merge-base", "--is-ancestor", ancestor, ref]);
    return true;
  } catch {
    return false;
  }
}
