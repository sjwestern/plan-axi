# 01 - Add idea and backlog commands

Owns: packages/change-axi/src/commands.ts, packages/change-axi/src/backlog.ts, packages/change-axi/test/backlog.test.ts
Docs: none

## Goal

Agents can capture unplanned items with `change-axi idea` and list them with `change-axi backlog`.

## Context

Kinds idea|bug|chore mark unplanned items; `kind: change` is reserved for items with a plan folder. Tasks go through `runTasks` (tasks-axi). Backlog file is `backlog.md`. Priority is the tasks-axi `--priority 0-4` field (0 highest). Step 2 reuses the slug-taken check and kind helpers defined here, so export them from `src/backlog.ts`. ADR-0001-task-state-and-dependencies-live-in-tasks-axi: `tasks-axi add` on an existing id is a silent no-op, so check first.

## Work

1. Create `src/backlog.ts` exporting: `UNPLANNED_KINDS`, `deriveSlug(title)` (kebab-case, lowercase, verb kept first, drop stop punctuation, max 50 chars, no random suffix), `slugTaken(ctx, slug)` returning where it is taken (active plan, archived plan, backlog item in any state) or undefined, and `listUnplanned(ctx)` sorted by priority then age.
2. Add `idea` command: `change-axi idea "<one-liner>" [--kind idea|bug|chore] [--slug <s>] [--body <text>] [--priority 0-4] [--repo <name>]`. Validate kind and slug via `checkSlug` and `slugTaken`; error with a suggestion on collision. Run `tasks-axi add <slug> <title> --kind <k> [--repo] [--priority] [--body] --file backlog.md`.
3. Add `backlog` command listing unplanned items: slug, kind, priority, repo, title; hint to run plan-propose. Empty state prints a hint to run `change-axi idea`.
4. Register both in `commands.ts` with help text and examples; make `newCommand` use `slugTaken` for its collision check.
5. Tests in `test/backlog.test.ts`: slug derivation, collisions with active, archived and done backlog items, kind validation, priority sort, repo passthrough.

## Done when

`npm test -w packages/change-axi` passes. In a scratch repo `change-axi idea "dark mode toggle" --kind chore --priority 1 --repo web` then `change-axi backlog` shows the item with kind chore, priority 1, repo web. `change-axi idea` with a slug already active, archived or done in the backlog fails with a suggestion.
