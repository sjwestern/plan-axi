# 02 - Show fields in status where list

Owns: packages/change-axi/src/commands.ts, packages/change-axi/src/where.ts, packages/change-axi/test/status-backlog.test.ts
Docs: none

## Goal

status, where and the bare list show backlog state; status shows worktree and the stale warning.

## Context

Stale = backlog in_flight, current branch is not the slug, and stepStatesDiffer is true. Warning text: `plan state stale, see worktree` in a `warnings` array (path is in `worktree:`). Stale help: `cd <worktree> && change-axi status <slug>` replaces the enter hints. Backlog in_flight with no worktree and no branch: warning `in flight but no worktree or branch`, help `change-axi enter <slug>`. Archived status unchanged. `where` gets no help[]. List marks stale rows `in_flight!`.

## Work

1. statusCommand: add `backlog:` and `worktree:`, both warnings and the stale/lost-lease help in statusHelp.
2. whereCommand: add `backlog:` for active and backlog-only items.
3. homeCommand: add one `backlog` column using backlogStates; mark stale rows via stepStatesDiffer.
4. Update `--help` text for status, where.
5. Tests in test/status-backlog.test.ts covering every acceptance case.

## Done when

`npm test` passes; manual `change-axi status <slug>` on main for an in-flight change shows the warning and cd hint.
