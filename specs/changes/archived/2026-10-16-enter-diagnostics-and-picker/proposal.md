# Enter diagnostics, change listing and slug-less enter

## Why

enter fails with opaque treehouse errors and cannot recover from a leftover branch or resume an in-flight step. Users also cannot see which changes have a worktree, and must remember the slug. Matters to anyone driving changes through change-axi enter.

## Context

docs/architecture/plan-workflow.md, docs/domain/cli-quick-reference.md, docs/decisions/0006-agent-launch-uses-a-command-template.md (enter launches a template command). Code: packages/change-axi/src/start.ts (leaseWorktree, tryTreehouse), commands.ts (enterCommand), home.ts. Already done uncommitted on main: leaseWorktree recreates a branch with no unique commits and switches to one with work; enterCommand resumes the single in-flight step. Step 01 covers its tests and docs.

## What changes

- enter prints the cause of a treehouse failure plus a diagnosis (branch exists with N commits, branch checked out elsewhere, base unresolved) and a fix hint.
- Existing-branch and resume behavior has tests.
- New change-axi enter --list: one row per active change with slug, worktree path (or -), branch state and in-flight step.
- change-axi enter with no slug: uses the only in-flight change; with several, lists them and exits with a hint (non-TTY) or picks interactively (TTY).

## Out of scope

treehouse return in finish/archive (finish already does it). Changing treehouse itself. Multi-agent coordination.

## Approach

Extend start.ts with a diagnose(slug) helper called from tryTreehouse failures in leaseWorktree: inspects branch existence, unique commit count and checked-out worktrees via git worktree list. Add a listEnterable(ctx) in a new enter-list.ts that joins active changes, statusRows and per-worktree in-flight steps. enterCommand makes slug optional (min 0) and resolves it through listEnterable. Alternative: separate list command (rejected: user asked for enter --list). Alternative: always prompt on several (rejected: breaks non-TTY use).

## Steps

- `01-test-and-document-existing-branch-and-re.md` - tests and docs for existing-branch recovery and resume
- `02-diagnose-treehouse-failures.md` - cause and hint on treehouse errors
- `03-add-enter-list.md` - enter --list
- `04-slug-less-enter.md` - enter with no slug

## Acceptance

npm test passes. In a scratch repo: enter on a slug whose branch equals main succeeds; on a branch with commits switches to it; a forced treehouse failure prints a cause line; enter --list shows all active changes; enter with one in-flight change resumes it; with two prints the list.

## Docs impact

`docs/domain/cli-quick-reference.md` - update: enter --list, optional slug.
`docs/architecture/plan-workflow.md` - update: enter recovery and resume behavior.

## Risks and open questions

- Deleting a branch with no commits beyond the default branch is accepted (confirmed). If the comparison cannot be made, enter stops with reason and guidance and deletes nothing.
- Interactive picker uses readline (no new dependency), TTY only.
- git worktree list parsing differs on Windows paths.
