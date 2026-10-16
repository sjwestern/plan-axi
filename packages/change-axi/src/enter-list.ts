import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { activeDir, tasksRel, type Ctx } from "./change.js";
import { git } from "./git.js";
import { statusRows } from "./start.js";
import { listTasks } from "./tasks.js";

export interface EnterRow {
  slug: string;
  worktree: string;
  branch_state: "leased" | "branch" | "none";
  in_flight: string;
}

/** One row per active change: its leased worktree (or "-"), branch state and in-flight steps. */
export function listEnterable(ctx: Ctx): EnterRow[] {
  const dir = activeDir(ctx);
  const slugs = existsSync(dir) ? readdirSync(dir).filter((f) => existsSync(join(dir, f, "proposal.md")) || existsSync(join(dir, f, "tasks.md"))).sort() : [];
  let rows: { name: string; path: string; branch?: string }[] = [];
  try {
    rows = statusRows(ctx);
  } catch {
    /* treehouse missing or failing: list without worktrees */
  }
  return slugs.map((slug) => {
    const row = rows.find((r) => r.branch === slug);
    const hasBranch = git(ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], true) !== "";
    // The worktree's branch holds the live step state; fall back to the main checkout.
    let flying: string[] = [];
    try {
      flying = listTasks(row?.path ?? ctx.root, tasksRel(slug)).filter((t) => t.state === "in_flight").map((t) => t.id);
    } catch {
      /* no tasks file */
    }
    return {
      slug,
      worktree: row?.path ?? "-",
      branch_state: row ? "leased" : hasBranch ? "branch" : "none",
      in_flight: flying.join(",") || "none",
    };
  });
}
