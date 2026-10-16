# 03 - Finish command

Owns: packages/change-axi/src/finish.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/finish.test.ts
Docs: docs/architecture/plan-workflow.md, docs/decisions/0004-plans-are-committed-on-main-steps-run-in-a-worktree.md

## Goal

`change-axi finish <slug>` merges the archived branch into main and releases its worktree, from the main checkout.

## Context

ADR 4: plans on main, steps on a branch in a worktree. start.ts finds the worktree via the `treehouse status` row whose branch label is the slug (`statusRows`; export it for reuse). `treehouse return <path>` ends lingering processes including the shell. Archive on a branch puts the plan under specs/changes/archived/<date>-<slug>/ on that branch only, so check with `git ls-tree` / `git show <slug>:...`, not the working tree.

## Work

1. `src/finish.ts`: `finish(ctx, slug, {dryRun})`; validate (on base branch, clean tree, branch exists, archived proposal present on branch, base is ancestor of branch); error VALIDATION_ERROR with a fix hint for each.
2. Dry run returns the planned merge and return; real run does `git merge --ff-only <slug>`, then `treehouse return <path>` if a worktree is found (note when not).
3. Output: `merged` (short sha), `returned` (path or none), `help` with the build hint `npm run build` from AGENTS.md if present.
4. Register in cli.ts with CmdSpec/help; `test/finish.test.ts` with tempRepo and a fake treehouse on PATH: happy path, unarchived branch, dirty tree, diverged branch, no worktree.

## Done when

`npm test -w packages/change-axi` passes including finish.test.ts; failing cases leave main unchanged (`git rev-parse HEAD` same before and after).
