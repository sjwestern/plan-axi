# 01 - Add backlog state and worktree lookup helpers

Owns: packages/change-axi/src/change.ts, packages/change-axi/src/enter-list.ts, packages/change-axi/test/backlog-state.test.ts
Docs: none

## Goal

Shared helpers give backlog state (one slug or all slugs) and the slug-to-worktree lookup.

## Context

getBacklogItem spawns `tasks-axi show` per slug; the all-slugs helper must use one `tasks-axi list --file backlog.md` call. Failures return `-`, never throw, never name the dependency. Step 02 relies on these exports.

## Work

1. change.ts: add `backlogState(ctx, slug)` and `backlogStates(ctx)` (Map slug -> queued|in_flight|done), `-`/absent when backlog.md is missing or the call fails.
2. enter-list.ts: extract `worktreeFor(ctx, slug)` (path or `-`) from `listEnterable` and reuse it there.
3. change.ts: add `stepStatesDiffer(ctx, slug)`: compares id->state of main tasks.md with the worktree working copy, or the branch tip (`git show <slug>:<tasks path>`) when no worktree; false when neither exists.
4. Tests in test/backlog-state.test.ts: states, missing file, failing tasks-axi, single list call, differ true/false incl. uncommitted start and branch-only.

## Done when

`npm test` passes including the new tests; `enter --list` output is unchanged.
