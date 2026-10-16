# 03 - Add enter list

Owns: packages/change-axi/src/enter-list.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/enter-list.test.ts
Docs: none

## Goal

change-axi enter --list shows every active change with its worktree and in-flight step.

## Context

Sources: active changes (home.ts logic), statusRows (start.ts) for worktrees by branch label, listTasks on the worktree path for in-flight steps. Treehouse missing must not fail the list: show worktree as -.

## Work

1. New enter-list.ts exporting listEnterable(ctx) -> rows {slug, worktree, branch_state, in_flight}.
2. Add --list boolean to ENTER_SPEC; min becomes 0 when set. Output as toon rows.
3. Tests in enter-list.test.ts.

## Done when

change-axi enter --list prints one row per active change; tests pass.
