# 01 - Delete branch option

Owns: packages/change-axi/src/finish.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/finish.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

`finish --delete-branch` removes the merged branch after the worktree is returned.

## Context

finish.ts: merge, then `tryTreehouse(ctx, ["return", row.path])`, then builds the report. FINISH_SPEC and `finishCommand` are in commands.ts (~598). A worktree checked out on the branch blocks `git branch -d`, so delete after return. Use `git(ctx, ["branch", "-d", slug])` in a try/catch.

## Work

1. Add `deleteBranch: boolean` to FinishOptions and `branchDeleted: string` plus optional `warnings: string[]` to FinishReport.
2. After `treehouse return`, if set: `git branch -d <slug>`; on error push a warning `could not delete <slug>: <reason>; run git branch -d <slug>`.
3. Dry run: `branchDeleted` = `planned: delete <slug>` when set.
4. commands.ts: add `--delete-branch` to FINISH_SPEC flags, usage and help; emit `branch_deleted` and `warnings` in output.
5. finish.test.ts: with flag the branch is gone; without it remains; dry run keeps it; failure (e.g. stub that leaves branch checked out elsewhere) yields a warning and exit 0.

## Done when

`npm test -w packages/change-axi` passes including the new finish cases; `finish --help` lists --delete-branch.
