# 02 - Resumable finish

Owns: packages/change-axi/src/finish.ts, packages/change-axi/test/finish.test.ts, packages/change-axi/test/flow.test.ts
Docs: none

## Goal

Rerunning finish after a stuck return finds the slot, returns it, and finishes the cleanup.

## Context

Uses leaseHolder from step 01. Branch-label match stays first. Ancestor/archived checks already exist in finish.ts (isAncestorOf, archivedPaths).

## Work

1. Resolve worktree: row by branch, else row with leaseHolder === slug.
2. If slug is already an ancestor of base and archived: skip dirty/rebase/archive/merge, report merged: already in <base>.
3. With a row, run `treehouse return <row.name>`; keep the stuck warning, now naming the slot and saying rerun completes the job.
4. Without a row and already merged+archived: succeed with warning (treehouse status, treehouse return <name>); honor --delete-branch.
5. Without a row and not merged: keep NOT_FOUND.
6. Tests with a fake treehouse: return fails once then succeeds; holder-less slot; unmerged branch.

## Done when

`npm test` passes. Flow test: first finish merges and warns, second finish returns the slot and deletes the branch with --delete-branch, with no second merge or archive commit.
