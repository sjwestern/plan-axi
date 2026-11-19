# 05 - Add review command

Owns: packages/change-axi/src/review/review.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/review.test.ts
Docs: none

## Goal

`change-axi review [slug]` opens a hunk tab per leased repo worktree that has something to review.

## Context

Uses Viewer and Backend from steps 01 and 03. Review base is the branch creation commit, not main, so a repo already merged still shows the change's commits. Same slug resolution as the other commands: argument, herdr workspace label, current branch, the only leased change; several candidates list and exit 1, never prompt. Needs a herdr pane unless `--print`.

## Work

1. `src/review/review.ts`: for the plan worktree and each repo in `change-axi status` with commits ahead of base or uncommitted edits, open tab `review:<repo>` running `viewer.open`. A tab already open is a no-op (exit 0).
2. Flags: `--repo <name>` (repeatable), `--all` (include unchanged), `--split` (one tab, one pane per repo), `--wip` (review uncommitted work), `--focus`, `--print`.
3. Register in `commands.ts` and `cli.ts` with usage text; unknown flags rejected.
4. Output TOON: one row per repo (repo, tab, state) with help to send feedback.
5. `review.test.ts` with fakes: tabs per changed repo, idempotent rerun, unchanged repo skipped, `--print` outside herdr, Windows env applied.

## Done when

npm test passes; `review --print` lists the tab and command per repo and opens nothing.
