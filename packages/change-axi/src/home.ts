import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AxiStructuredOutput } from "docs-axi/lib/types";
import { computeWaves } from "./check.js";
import { activeDir, tasksRel, type Ctx } from "./change.js";
import { git } from "./git.js";
import { repoStateRows, repoStates } from "./repostate.js";
import { listTasks } from "./tasks.js";

/** Slug when the current branch is named like an active change, else undefined. */
export function currentChangeSlug(ctx: Ctx): string | undefined {
  const branch = git(ctx, ["branch", "--show-current"], true);
  if (!branch) return undefined;
  return existsSync(join(activeDir(ctx), branch, "tasks.md")) ? branch : undefined;
}

/** Current branch and checkout path (the worktree path when in a linked worktree). */
export function whereAmI(ctx: Ctx, fallbackBranch = ""): Record<string, string> {
  const branch = git(ctx, ["branch", "--show-current"], true) || fallbackBranch;
  const top = git(ctx, ["rev-parse", "--show-toplevel"], true);
  const linked = git(ctx, ["rev-parse", "--git-dir"], true) !== git(ctx, ["rev-parse", "--git-common-dir"], true);
  return { branch, ...(top ? { [linked ? "worktree" : "checkout"]: top } : {}) };
}

export function changeHome(ctx: Ctx, slug: string): AxiStructuredOutput {
  const tasks = listTasks(ctx.root, tasksRel(slug));
  const active = tasks.filter((t) => t.state !== "done");
  const { waves } = computeWaves(active);
  const waveOf = new Map<string, number>();
  for (const [w, ids] of waves) for (const id of ids) waveOf.set(id, w);
  const ready = active.filter((t) => t.state === "queued" && t.blockers.length === 0).map((t) => t.id);
  const inFlight = active.filter((t) => t.state === "in_flight").map((t) => t.id);
  const help: string[] = [];
  if (ready[0]) help.push(`Prompt: apply ${slug} ${ready[0]}`);
  else if (active.length === 0) help.push(`All steps done; run \`change-axi archive ${slug} --dry-run\``);
  else help.push("No ready steps; waiting on in-flight steps");
  help.push(`Run \`change-axi status ${slug}\` for the step graph`);
  const repos = repoStateRows(repoStates(ctx, slug));
  return {
    change: slug,
    ...whereAmI(ctx, slug),
    ...(repos.length > 0 ? { repos } : {}),
    progress: `${tasks.length - active.length}/${tasks.length} done`,
    steps: tasks.map((t) => ({ id: t.id, state: t.state, blocked_by: t.blockers.join(",") || "none", wave: waveOf.get(t.id) ?? "-" })),
    in_flight: inFlight.join(",") || "none",
    ready: ready.join(",") || "none",
    help,
  };
}
