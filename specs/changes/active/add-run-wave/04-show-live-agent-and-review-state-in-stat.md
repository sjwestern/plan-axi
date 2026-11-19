# 04 - Show live agent and review state in status

Owns: packages/change-axi/src/status-live.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/status-live.test.ts
Docs: none

## Goal

`change-axi status` shows agent state per step, a pending review comment count, and a `live:` line saying what was queried.

## Context

Uses Backend.status from step 01 and Viewer.comments from step 03. Default status stays small and file based; live fields are added only when a backend is detected. Step state still follows the stale rules of `show-backlog-state-in-change-status`; this step adds columns, it does not change where state is read. Output follows the AXI skill: TOON, definitive empty states, a short help line.

## Work

1. `src/status-live.ts`: `liveState(ctx, slug)` returning per-step agent state (working, idle, blocked, or `-` for no tab) and per-worktree pending comment counts, with a short timeout on each query.
2. In status output add an `agent` column only when a backend is available, one aggregate line `review: N comments pending (<repo>, ...)` only when N > 0, and `live: herdr+hunk`, `live: herdr`, or `live: off (<reason>)`. A repo whose query fails is named on the `live:` line, never marked per row.
3. Flags: `--no-live` skips both queries; `--fields <list>` adds columns (`tab`, `worktree`, `owns`, `tier`).
4. Help lines: `change-axi review <slug>` when a step is done, `change-axi feedback <slug> --send` when comments are pending.
5. `status-live.test.ts` with the fake herdr and fake hunk: columns present and absent, comments line, `live:` variants, `--no-live`, timeout, failing repo.

## Done when

npm test passes; outside herdr `change-axi status <slug>` prints `live: off (not in herdr)` and no agent column; in herdr the column and review line appear.
