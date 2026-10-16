# 01 - Branch-aware home

Owns: packages/change-axi/src/home.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/home.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

Running `change-axi` with no args on a branch named like an active change shows that change instead of the generic list.

## Context

Branch name is read with `git branch --show-current` (see `git.ts`). Reuse `checkChange` waves and `listTasks`; do not parse tasks.md. Root resolution already works in worktrees (`.git` file). Keep the generic home for every other branch.

## Work

1. `src/home.ts`: `changeHome(ctx, slug)` returning progress, steps (id, state, blocked_by, wave), in_flight ids, ready ids, and help with the exact prompt `apply <slug> <first ready step>`.
2. `homeCommand` in `commands.ts`: if the current branch is an active slug, return `changeHome`; otherwise unchanged.
3. Test: temp git repo, create branch = slug, assert the change view and the generic home on main.

## Done when

`npm test` passes. In a repo on branch `<slug>`, `change-axi` prints that change's steps, ready list and an `apply <slug> <step>` line; on main it prints the list of active changes.
