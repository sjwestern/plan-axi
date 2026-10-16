# Archive follow-up hints and step add prefix ids

## Why

Two small slips from the add-agent-launch trial. After `archive --commit` on a branch the agent did not know the next commands (leave the treehouse shell, merge from the main checkout, release the worktree); one user also left the shell open after `treehouse return`. `step add --after 01` fails while `dep` accepts prefixes, an inconsistent rule agents trip on.

## Context

Docs read: `docs/domain/cli-quick-reference.md`, `docs/architecture/plan-workflow.md`. ADR 4 (plans on main, branch in worktree). Trial notes items 5 and 6 in `.agent-memory/plan-axi.md`. `treehouse --help` lists `return`, not `release`.

## What changes

- `archive` output (not dry run failures) includes `next` lines when archiving on a branch: `exit` the treehouse shell (it stays open after `treehouse return`), then from the main checkout `git merge --ff-only <slug>` and `treehouse return <worktree path>`; nothing extra when on main after merge.
- `step add --after` accepts id prefixes (`01`) resolved the same way as `dep`; ambiguous or unknown prefixes error.

## Out of scope

Running merge or return automatically; `--after` for `step set`; other commands.

## Approach

Archive: extend the report with a `next` array computed from the current branch, git toplevel and base branch. Step add: reuse the prefix resolver already used by `dep` (commands.ts) on the `--after` list before validating. No alternatives of note.

## Steps

- `01-archive-prints-follow-up-commands.md` - next lines in archive output
- `02-step-add-accepts-prefix-ids.md` - prefix resolution for --after

## Acceptance

- `npm test -w packages/change-axi` passes with new cases.
- `change-axi archive <slug> --dry-run` on a branch shows the next lines; `step add ... --after 01` stores the full id as the blocker.
- `change-axi check polish-archive-and-step-add` passes.

## Docs impact

None - behavior detail only; CLI help text covers it.

## Risks and open questions

- Edits packages/change-axi/src/commands.ts, also edited by add-claim-done-commands; run sequentially or rebase.
- Worktree path from `git rev-parse --show-toplevel` may differ from the treehouse pool path if symlinked.
