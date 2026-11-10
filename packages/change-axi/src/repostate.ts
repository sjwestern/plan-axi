import { AxiError } from "axi-sdk-js";
import { splitOwnsRepo, type Ctx } from "./change.js";
import { loadRepoRuntimes, type RepoRuntime } from "./repos.js";
import { changeRepos, repoDefaultBranch, repoStatusRows } from "./start.js";

export interface RepoState {
  repo: string;
  branch: string;
  base: string;
  /** Worktree path usable by this process, or "none" when no worktree holds the branch. */
  worktree: string;
  state: "clean" | "dirty" | "no-worktree" | "unavailable";
  /** Runtime and worktree for follow-up git calls; absent unless a worktree exists. */
  rt?: RepoRuntime;
  wt?: string;
  note?: string;
}

/** Per-repo state for the extra repos in the proposal `Repos:` header. Empty for single-repo changes. */
export function repoStates(ctx: Ctx, slug: string, runtimes?: Map<string, RepoRuntime>): RepoState[] {
  const refs = changeRepos(ctx, slug);
  if (refs.length === 0) return [];
  let rts: Map<string, RepoRuntime>;
  try {
    rts = runtimes ?? loadRepoRuntimes(ctx.root);
  } catch (e) {
    const note = e instanceof AxiError ? e.message : String(e);
    return refs.map((r) => ({ repo: r.name, branch: slug, base: r.base ?? "?", worktree: "none", state: "unavailable", note }));
  }
  return refs.map((ref): RepoState => {
    const rt = rts.get(ref.name);
    if (!rt) return { repo: ref.name, branch: slug, base: ref.base ?? "?", worktree: "none", state: "unavailable", note: `no [repos.${ref.name}] in config` };
    try {
      const base = ref.base ?? repoDefaultBranch(rt);
      const row = repoStatusRows(rt).find((r) => r.branch === slug);
      if (!row) return { repo: ref.name, branch: slug, base, worktree: "none", state: "no-worktree", rt };
      const wt = rt.toWsl(row.path);
      const porcelain = rt.git(["-C", rt.toNative(wt), "status", "--porcelain"], { raw: true });
      return { repo: ref.name, branch: slug, base, worktree: wt, state: porcelain.trim() === "" ? "clean" : "dirty", rt, wt };
    } catch (e) {
      return { repo: ref.name, branch: slug, base: ref.base ?? "?", worktree: "none", state: "unavailable", note: e instanceof AxiError ? e.message : String(e) };
    }
  });
}

/** Table rows for output: no runtime handles. */
export function repoStateRows(states: RepoState[]): Record<string, string>[] {
  return states.map((s) => ({ repo: s.repo, branch: s.branch, base: s.base, worktree: s.worktree, state: s.note ? `${s.state}: ${s.note}` : s.state }));
}

/** Owns entries (path part) that apply to one repo, or to the plan repo when `repo` is undefined. */
export function ownsFor(owns: string[], repo?: string): string[] {
  return owns.map(splitOwnsRepo).filter((o) => o.repo === repo).map((o) => o.path);
}
