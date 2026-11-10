import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { headerLine, readLf, requireChange, splitList, tasksRel, type Ctx } from "./change.js";
import type { RepoRuntime } from "./repos.js";
import { ownsFor, repoStates } from "./repostate.js";
import { commit, defaultBranch, git, isAncestorOf } from "./git.js";
import { listTasks, runTasks } from "./tasks.js";

export interface DoneResult {
  step: string;
  commit: string;
  warnings: string[];
}

const root = (s: string): string => s.replace(/[*?[{].*$/, "").replace(/\/+$/, "");
const inOwns = (path: string, owns: string[]): boolean => owns.some((o) => {
  const r = root(o);
  return r === "" || path === r || path.startsWith(`${r}/`);
});

/** Mark a started step done and commit only tasks.md. Warns on paths changed outside Owns. */
export function done(ctx: Ctx, slug: string, stepArg: string, since?: string, runtimes?: Map<string, RepoRuntime>): DoneResult {
  const dir = requireChange(ctx, slug);
  const file = tasksRel(slug);
  const tasks = listTasks(ctx.root, file);
  const hit = tasks.find((t) => t.id === stepArg) ?? tasks.filter((t) => t.id.startsWith(`${stepArg}-`)).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!hit) throw new AxiError(`no step "${stepArg}"`, "NOT_FOUND", [`Steps: ${tasks.map((t) => t.id).join(", ")}`]);
  if (hit.state === "done") throw new AxiError(`${hit.id} is already done`, "VALIDATION_ERROR");
  if (hit.state !== "in_flight") throw new AxiError(`${hit.id} is not started`, "VALIDATION_ERROR", [`Run \`change-axi claim ${slug} ${hit.id}\` first`]);
  const allOwns = splitList(headerLine(readLf(join(dir, `${hit.id}.md`)), "Owns"));
  const owns = ownsFor(allOwns);
  let base = since ?? git(ctx, ["log", "-1", "--format=%H", "--", file], true);
  if (!since && base) {
    // The plan commit may predate the branch point; skip history inherited from the default branch.
    const fork = git(ctx, ["merge-base", "HEAD", defaultBranch(ctx)], true);
    if (fork && fork !== base && fork !== git(ctx, ["rev-parse", "HEAD"], true) && isAncestorOf(ctx, base, fork)) base = fork;
  }
  const changed = base ? git(ctx, ["diff", "--name-only", `${base}..HEAD`], true).split("\n").filter(Boolean) : [];
  const planDir = `specs/changes/active/${slug}/`;
  const outside = changed.filter((p) => !p.startsWith(planDir) && !inOwns(p, owns));
  const extra: string[] = [];
  for (const s of repoStates(ctx, slug, runtimes)) {
    if (!s.rt || !s.wt) {
      const own = ownsFor(allOwns, s.repo);
      if (own.length > 0) extra.push(`REPO_UNCHECKED: ${s.repo} ${s.state}${s.note ? ` (${s.note})` : ""}; Owns not verified`);
      continue;
    }
    const native = s.rt.toNative(s.wt);
    const fork = s.rt.git(["-C", native, "merge-base", "HEAD", s.base], { allowFail: true });
    if (!fork) {
      extra.push(`REPO_UNCHECKED: ${s.repo} no merge-base with ${s.base}; Owns not verified`);
      continue;
    }
    const ch = s.rt.git(["-C", native, "diff", "--name-only", `${fork}..HEAD`], { allowFail: true }).split("\n").filter(Boolean);
    const bad = ch.filter((p) => !inOwns(p, ownsFor(allOwns, s.repo)));
    if (bad.length > 0) extra.push(`OUTSIDE_OWNS: ${s.repo}:${bad.join(`, ${s.repo}:`)} changed since ${fork.slice(0, 7)} but not in Owns of ${hit.id}`);
  }
  runTasks(ctx.root, ["done", hit.id, "--file", file]);
  git(ctx, ["add", "--", file]);
  try {
    commit(ctx, `done ${slug} ${hit.id}`, slug, [file]);
  } catch (e) {
    git(ctx, ["restore", "--staged", "--worktree", "--", file], true);
    throw e;
  }
  const warnings = [...(outside.length > 0 ? [`OUTSIDE_OWNS: ${outside.join(", ")} changed since ${base.slice(0, 7)} but not in Owns of ${hit.id}`] : []), ...extra];
  return { step: hit.id, commit: git(ctx, ["rev-parse", "--short", "HEAD"]), warnings };
}
