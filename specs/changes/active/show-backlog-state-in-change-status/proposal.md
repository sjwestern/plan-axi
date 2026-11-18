# Show backlog state and worktree in change-axi status, where and list

## Why

The backlog entry is the main-branch record that a change started. `tasks-axi` shows it, but `change-axi` reads only plan files. On main, `status` shows every step as queued for a change that is already in flight on its worktree branch, and suggests starting step 01 again. Agents and users get wrong output with no hint.

## Context

- docs/architecture/plan-workflow.md, docs/domain/cli-quick-reference.md, docs/architecture/package-structure.md
- No ADR constrains this area (ADR-0013-unplanned-backlog-items-use-their-own-kinds-and-are covers backlog kinds only).
- Code: `homeCommand`, `statusCommand`, `statusHelp` in commands.ts; `whereCommand` in where.ts; `getBacklogItem` in change.ts; `listEnterable` in enter-list.ts.
- Related: change:add-run-wave and change:add-medium-tier are queued; no overlap.

## What changes

- `status <slug>` gains `backlog:` (queued, in_flight, done or `-`) and `worktree:` (leased path or `-`).
- `where <slug>` gains `backlog:` for active and backlog-only changes.
- The bare `change-axi` list gains one `backlog` column; a stale row is marked `in_flight!`.
- Stale = backlog says in_flight, the checkout is not on the change branch, and step states on main differ from the change worktree (working copy, so uncommitted `start`/`done` count). With no leased worktree but an existing branch, compare against the branch tip. `status` then adds `warnings: plan state stale, see worktree` (path is in `worktree:`) and a help line `cd <worktree> && change-axi status <slug>` instead of the `enter` hints.
- Backlog in_flight with no worktree and no branch: `warnings: in flight but no worktree or branch` and help `change-axi enter <slug>`.
- Missing backlog.md, missing slug, or tasks-axi/treehouse failure degrade to `-`, exit 0, no dependency names in output.

## Out of scope

- Reading step state from the worktree into main output.
- Changing `enter --list` output or backlog state transitions.
- New help[] on `where` (detail view, self-contained).

## Approach

- New helper in change.ts returning backlog state for one slug and a map for all slugs (one `tasks-axi list --file backlog.md` call, not one `show` per slug).
- Extract the slug-to-worktree lookup from `listEnterable` so status and list share it.
- Stale check only off the change branch; inside the worktree plan files are live.
- Alternative rejected: status on main reads the worktree state. It hides staleness and is a bigger change.
- Follows AXI: minimal columns, definitive `-` empty values, fail-soft, placeholder-style hints, no help on detail view.

## Steps

- `01-add-backlog-state-and-worktree-lookup-he.md` - backlog state and worktree helpers
- `02-show-fields-in-status-where-list.md` - status, where, list output and stale warning
- `03-document-backlog-fields.md` - docs

## Acceptance

- Backlog in_flight, worktree step state differs from main, run on main: `status` shows `backlog: in_flight`, `worktree: <path>`, the stale warning and the cd hint.
- Worktree has an uncommitted `start`: still warns.
- Branch exists, no leased worktree, branch tip differs from main: warns, `worktree: -`.
- Main and worktree step states identical: no warning.
- Backlog in_flight, no worktree, no branch: lost-lease warning and enter hint.
- Run inside the worktree: no warning, existing hint.
- Backlog queued or done: no warning.
- Archived change: output unchanged.
- No backlog.md or tasks-axi/treehouse failing: `-` values, exit 0.
- Bare list: one `backlog` column, one tasks-axi call regardless of change count.
- `npm test` passes; `docs-axi check` passes.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: new status, where and list fields and the stale warning.
- `docs/architecture/plan-workflow.md` - update: note that main plan files lag the worktree and how status flags it (only if it describes status output).

## Risks and open questions

- Step comparison reads the worktree working copy; a worktree on a different base than main can differ for reasons other than progress, which still warrants a look.
- Warning lives in a `warnings` array, matching `check`.
