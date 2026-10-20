# 03 - Finish command

Owns: packages/change-axi/src/finish.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/finish.test.ts
Docs: docs/architecture/plan-workflow.md, docs/decisions/0004-plans-are-committed-on-main-steps-run-in-a-worktree.md

## Goal

`change-axi finish <slug>` archives the change if needed, merges the branch into main and releases its worktree, from the main checkout, with a dry run to preview.

## Context

ADR-0004-plans-are-committed-on-main-steps-run-in-a-worktree: plans on main, steps on a branch in a worktree. `archive` stays its own command (step 01 only adds a hint); finish calls the exported `archiveChange(ctx, slug, {dryRun, commit: true, skipDocsCheck})` with `ctx.root` = worktree path, so its branch/clean/tasks-done/Docs checks apply unchanged. start.ts finds the worktree via the `treehouse status` row whose branch label is the slug (`statusRows`; export it). `treehouse return <path>` ends lingering processes including the shell. Archive on a branch puts the plan under specs/changes/archived/<date>-<slug>/ on that branch only: detect with `git ls-tree -r --name-only <slug> -- specs/changes/archived`, not the main working tree.

## Work

1. `src/finish.ts`: `finish(ctx, slug, {dryRun, skipDocsCheck})`. Preflight: on base branch, main tree clean, branch `<slug>` exists, worktree found (error with fix hint if the branch exists but has no worktree: archive there manually, or merge by hand).
2. Archived check on the branch. If not archived, call `archiveChange` with a worktree-rooted ctx and `commit: true` (`dryRun: true` in a dry run). Surface archive errors unchanged.
3. Verify base is an ancestor of the branch; on failure error with a `rebase` hint.
4. Real run: `git merge --ff-only <slug>`, then `treehouse return <path>`. Dry run stops before this and reports what would happen.
5. Output: `archived` (done / skipped / dry run), `adrs` accepted (from the archive report), `docs_not_updated` when any, `merged` (short sha or planned), `returned` (path), `help` with the build hint from AGENTS.md if present.
6. Register in cli.ts with CmdSpec/help (usage lists --dry-run, --skip-docs-check); `test/finish.test.ts` with tempRepo and a fake treehouse on PATH: not archived (archives then merges), already archived (skips), unfinished tasks, dirty main, diverged branch, dry run changes nothing.

## Done when

`npm test -w packages/change-axi` passes including finish.test.ts; failing cases and `--dry-run` leave main `HEAD` and the branch tip unchanged; the already-archived case creates no second archive commit.
