import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { guardAdrs } from "./adrguard.js";
import { archiveChange } from "./archive.js";
import type { Ctx } from "./change.js";
import { defaultBranch, git } from "./git.js";
import { loadRepoRuntimes, type RepoRuntime } from "./repos.js";
import { changeRepos, repoDefaultBranch, repoStatusRows, statusRows, tryTreehouse } from "./start.js";

export interface FinishOptions {
  dryRun: boolean;
  skipDocsCheck: boolean;
  deleteBranch: boolean;
  /** Injected runtimes for the extra repos (tests); defaults to the configured ones. */
  runtimes?: Map<string, RepoRuntime>;
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
  /** Per-repo table for changes with a `Repos:` header (extra repos only). */
  repos?: Record<string, string>[];
  /** False when a dry run found a repo that blocks the real finish. */
  ready?: boolean;
}

export type RepoFinishState = "ready" | "merged" | "rebase-needed" | "dirty" | "wrong-branch" | "unavailable";

export interface RepoFinishPlan {
  repo: string;
  base: string;
  state: RepoFinishState;
  ahead: string;
  behind: string;
  note: string;
  rt?: RepoRuntime;
  /** Leased worktree (process path) and treehouse slot name, when one holds the branch. */
  wt?: string;
  slot?: string;
}

function gitOk(rt: RepoRuntime, args: string[]): boolean {
  try {
    rt.git(args);
    return true;
  } catch {
    return false;
  }
}

/** Preflight one extra repo: clean worktree and main checkout, branch exists, base is an ancestor of the branch. */
function planRepo(rt: RepoRuntime, slug: string, baseRef: string | undefined): RepoFinishPlan {
  const base = baseRef ?? repoDefaultBranch(rt);
  const mk = (state: RepoFinishState, note: string, extra: Partial<RepoFinishPlan> = {}): RepoFinishPlan => ({ repo: rt.name, base, state, ahead: "-", behind: "-", note, rt, ...extra });
  try {
    const row = repoStatusRows(rt).find((r) => r.branch === slug) ?? repoStatusRows(rt).find((r) => r.leaseHolder === slug);
    const wt = row ? rt.toWsl(row.path) : undefined;
    const slot = row?.name;
    const loc = { ...(wt ? { wt } : {}), ...(slot ? { slot } : {}) };
    if (rt.git(["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], { allowFail: true }) === "") {
      return mk("merged", "branch gone (merged earlier)", loc);
    }
    if (gitOk(rt, ["merge-base", "--is-ancestor", slug, base])) return mk("merged", `${slug} already in ${base}`, { ahead: "0", behind: "0", ...loc });
    const counts = rt.git(["rev-list", "--left-right", "--count", `${base}...${slug}`]).split(/\s+/);
    const behind = counts[0] ?? "?";
    const ahead = counts[1] ?? "?";
    const counted = { ahead, behind, ...loc };
    if (wt) {
      const dirty = rt.git(["-C", rt.toNative(wt), "status", "--porcelain", "--untracked-files=no"], { raw: true });
      if (dirty.trim() !== "") return mk("dirty", `worktree ${wt} has uncommitted changes; commit them`, counted);
    }
    if (rt.git(["status", "--porcelain", "--untracked-files=no"], { raw: true }).trim() !== "") {
      return mk("dirty", `${base} checkout ${rt.path} has uncommitted changes`, counted);
    }
    const current = rt.git(["branch", "--show-current"]);
    if (current !== base) return mk("wrong-branch", `${rt.path} is on "${current}", not ${base}; switch it`, counted);
    if (behind !== "0") {
      const git = rt.viaWindows ? "git.exe" : "git";
      return mk("rebase-needed", `${git} -C ${wt ? rt.toNative(wt) : rt.nativePath} rebase ${base}`, counted);
    }
    return mk("ready", `ff ${slug} into ${base}`, counted);
  } catch (e) {
    return mk("unavailable", e instanceof AxiError ? e.message : String(e));
  }
}

/** Preflight every extra repo in the change `Repos:` header. Empty for single-repo changes. */
export function planRepos(ctx: Ctx, slug: string, runtimes?: Map<string, RepoRuntime>): RepoFinishPlan[] {
  let refs: ReturnType<typeof changeRepos>;
  try {
    refs = changeRepos(ctx, slug);
  } catch (e) {
    if (e instanceof AxiError && e.code === "NOT_FOUND") return [];
    throw e;
  }
  if (refs.length === 0) return [];
  const rts = runtimes ?? loadRepoRuntimes(ctx.root);
  return refs.map((ref) => {
    const rt = rts.get(ref.name);
    if (!rt) return { repo: ref.name, base: ref.base ?? "?", state: "unavailable", ahead: "-", behind: "-", note: `no [repos.${ref.name}] in config` };
    return planRepo(rt, slug, ref.base);
  });
}

export function repoPlanRows(plans: RepoFinishPlan[]): Record<string, string>[] {
  return plans.map((p) => ({ repo: p.repo, base: p.base, ahead: p.ahead, behind: p.behind, state: p.state, detail: p.note }));
}

function blockers(plans: RepoFinishPlan[]): RepoFinishPlan[] {
  return plans.filter((p) => p.state !== "ready" && p.state !== "merged");
}

function blockedError(plans: RepoFinishPlan[], slug: string): AxiError {
  const bad = blockers(plans);
  return new AxiError(
    `${bad.length} repo(s) not ready: ${bad.map((b) => `${b.repo} (${b.state})`).join(", ")}; nothing was merged`,
    "VALIDATION_ERROR",
    [...bad.map((b) => `${b.repo}: ${b.note}`), `Fix them (run \`change-axi finish ${slug} --dry-run\` to recheck), then run finish again`],
  );
}

/** ff-merge each ready extra repo, return its lease, optionally delete the branch. Merged repos are skipped on rerun. */
function mergeRepos(plans: RepoFinishPlan[], slug: string, deleteBranch: boolean, warnings: string[]): { repo: string; result: string }[] {
  const done: { repo: string; result: string }[] = [];
  const pending = (from: number): string[] => plans.slice(from).filter((p) => p.state === "ready").map((p) => p.repo);
  plans.forEach((p, i) => {
    const rt = p.rt as RepoRuntime;
    let result = `already in ${p.base}`;
    if (p.state === "ready") {
      try {
        rt.git(["merge", "--ff-only", slug]);
        result = rt.git(["rev-parse", "--short", "HEAD"]);
      } catch (e) {
        const merged = done.filter((d) => d.result !== `already in ${p.base}`).map((d) => d.repo);
        throw new AxiError(`merge failed in repo ${p.repo}: ${(e as Error).message}`, "GIT_ERROR", [
          `merged: ${merged.join(", ") || "none"}`,
          `pending: ${pending(i).join(", ")}, plus the plan repo`,
          `Fix ${p.repo}, then rerun \`change-axi finish ${slug}\`; merged repos are skipped`,
        ]);
      }
    }
    let stuck = false;
    if (p.slot) {
      try {
        rt.treehouse(["return", p.slot]);
      } catch (e) {
        if (!(e instanceof AxiError) || e.code !== "TREEHOUSE_ERROR") throw e;
        stuck = true;
        warnings.push(`${p.repo}: merged, but worktree ${p.wt} not returned (${e.message}); rerun finish after closing what holds it`);
      }
    }
    if (deleteBranch && !stuck && rt.git(["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], { allowFail: true }) !== "") {
      try {
        rt.git(["branch", "-d", slug]);
      } catch (e) {
        warnings.push(`${p.repo}: could not delete ${slug}: ${(e as Error).message}`);
      }
    }
    done.push({ repo: p.repo, result });
  });
  return done;
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
  guardAdrs(ctx, `change-axi finish ${slug} --dry-run`);
  const archivedPaths = git(ctx, ["ls-tree", "-r", "--name-only", slug, "--", "specs/changes/archived"]).split("\n");
  const already = archivedPaths.some((f) => new RegExp(`^specs/changes/archived/\\d{4}-\\d{2}-\\d{2}-${slug}/`).test(f));
  let adrs: FinishReport["adrs"] = [];
  let untouched: string[] = [];
  if (!already) {
    const r = archiveChange(ctx, slug, { dryRun: true, commit: true, skipDocsCheck: o.skipDocsCheck });
    adrs = r.adrs;
    untouched = r.untouched;
  }
  const plans = planRepos(ctx, slug, o.runtimes);
  const ok = blockers(plans).length === 0;
  return {
    archived: already ? "skipped (already archived)" : "dry run (would archive)",
    adrs,
    untouched,
    merged: ok ? `ready: ${slug} is up to date with ${base}; the human runs \`change-axi finish ${slug}\` from the main checkout` : `not ready: ${blockers(plans).length} repo(s) need attention`,
    returned: "n/a (run from main)",
    ...(plans.length > 0 ? { repos: repoPlanRows(plans), ready: ok } : {}),
  };
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
  const rows = statusRows(ctx);
  // A stuck return leaves the slot detached with no branch label; the lease holder still names the change.
  const row = rows.find((r) => r.branch === slug) ?? rows.find((r) => r.leaseHolder === slug);
  const mergedAlready = isAncestorOf(ctx, slug, base) && hasArchived(ctx, base, slug);
  if (!row && !mergedAlready) {
    throw new AxiError(`no treehouse worktree on branch "${slug}"`, "NOT_FOUND", [
      `Archive on the ${slug} branch manually (\`change-axi archive ${slug} --commit\`), then merge it by hand`,
    ]);
  }
  const warnings: string[] = [];
  const plans = planRepos(ctx, slug, o.runtimes);
  const repoInfo = (ps: RepoFinishPlan[], results?: { repo: string; result: string }[]): Partial<FinishReport> =>
    ps.length === 0
      ? {}
      : {
          repos: repoPlanRows(ps).map((r) => {
            const res = results?.find((d) => d.repo === r.repo);
            return res ? { ...r, state: "merged", detail: res.result } : r;
          }),
          ready: blockers(ps).length === 0,
        };
  let archived = "skipped (already archived)";
  let adrs: FinishReport["adrs"] = [];
  let untouched: string[] = [];
  let merged: string;
  let results: { repo: string; result: string }[] | undefined;

  if (mergedAlready) {
    merged = `already in ${base}`;
    if (o.dryRun) return { archived, adrs, untouched, merged, returned: row ? `planned: ${row.path}` : "none found", ...repoInfo(plans), ...(o.deleteBranch ? { branchDeleted: `planned: delete ${slug}` } : {}) };
  } else {
    const wt: Ctx = { root: (row as { path: string }).path };
    const wtDirty = git(wt, ["status", "--porcelain", "--untracked-files=no"]);
    if (wtDirty !== "") {
      withAgentHint(new AxiError(`worktree ${wt.root} has uncommitted changes`, "VALIDATION_ERROR", wtDirty.split("\n").slice(0, 10).concat("Commit them first")), slug);
    }
    if (!isAncestorOf(ctx, base, slug)) {
      withAgentHint(new AxiError(`${base} is not an ancestor of ${slug}`, "VALIDATION_ERROR", [`In the worktree: git rebase ${base}`]), slug);
    }
    if (!o.dryRun && blockers(plans).length > 0) throw blockedError(plans, slug);
    if (!hasArchived(ctx, slug, slug)) {
      try {
        guardAdrs(wt, `change-axi finish ${slug}${o.dryRun ? " --dry-run" : ""}`);
      } catch (e) {
        withAgentHint(e, slug);
      }
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
    if (o.dryRun) return { archived, adrs, untouched, merged: `planned: ff ${slug} into ${base}`, returned: `planned: ${wt.root}`, ...repoInfo(plans), ...(o.deleteBranch ? { branchDeleted: `planned: delete ${slug}` } : {}) };
    results = mergeRepos(plans, slug, o.deleteBranch, warnings);
    git(ctx, ["merge", "--ff-only", slug]);
    merged = git(ctx, ["rev-parse", "--short", "HEAD"]);
  }

  const rerun = `change-axi finish ${slug}${o.deleteBranch ? " --delete-branch" : ""}`;
  let returned = "none found";
  let stuck = false;
  if (row) {
    returned = row.path;
    try {
      tryTreehouse(ctx, ["return", row.name]);
    } catch (e) {
      if (!(e instanceof AxiError) || e.code !== "TREEHOUSE_ERROR") throw e;
      stuck = true;
      returned = `not returned: ${row.path}`;
      const procs = /live processes after termination: ([^|]*)/.exec(e.message)?.[1]?.trim();
      warnings.push(
        `merged, but worktree not returned: processes still run in ${row.path}${procs ? ` (${procs})` : ""}. Likely an editor (VS Code) reopening them; close its window for that folder, then rerun \`${rerun}\` to finish the job (slot ${row.name}; safe to repeat)`,
      );
    }
  } else {
    warnings.push(`${slug} is merged and archived but no worktree is leased to it (leased before lease holders existed). Run \`treehouse status\`, then \`treehouse return <name>\` for its slot`);
  }
  let branchDeleted: string | undefined;
  if (o.deleteBranch && !stuck) {
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
  return { archived, adrs, untouched, merged, returned, ...repoInfo(plans, results), ...(branchDeleted ? { branchDeleted } : {}), ...(warnings.length > 0 ? { warnings } : {}), ...(cmd ? { buildHint: `Rebuild if the change touched code: ${cmd}` } : {}) };
}

function hasArchived(ctx: Ctx, ref: string, slug: string): boolean {
  const paths = git(ctx, ["ls-tree", "-r", "--name-only", ref, "--", "specs/changes/archived"], true).split("\n");
  return paths.some((f) => new RegExp(`^specs/changes/archived/\\d{4}-\\d{2}-\\d{2}-${slug}/`).test(f));
}

function isAncestorOf(ctx: Ctx, ancestor: string, ref: string): boolean {
  try {
    git(ctx, ["merge-base", "--is-ancestor", ancestor, ref]);
    return true;
  } catch {
    return false;
  }
}
