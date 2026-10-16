# Archive follow-up hints and step add prefix ids

## Why

Three slips from the add-agent-launch trial. After `archive --commit` on a branch the agent and user ran manual follow-ups (merge from the main checkout, release the worktree), and one user left a treehouse shell open after `treehouse return`. `step add --after 01` fails while `dep` accepts prefixes, an inconsistent rule agents trip on. Finishing a change by hand is several commands in the right order and place.

## Context

Docs read: `docs/domain/cli-quick-reference.md`, `docs/architecture/plan-workflow.md`. ADR 4 (plans on main, branch in worktree). Trial notes items 5 and 6 in `.agent-memory/plan-axi.md`. `treehouse --help` lists `return`, not `release`.

## What changes

- `archive` output on a branch includes one `next` line: `from the main checkout: change-axi finish <slug>`; nothing extra on main after merge.
- New `change-axi finish <slug> [--dry-run]`, run from the main checkout: requires the change archived on branch `<slug>`, a clean tree and a fast-forwardable branch; runs `git merge --ff-only <slug>`, then `treehouse return <worktree>` when a worktree for the slug exists, and prints the repo build hint. Needs no shell exit when the agent was launched with `change-axi enter`.
- `step add --after` accepts id prefixes (`01`) resolved like `dep`; ambiguous or unknown prefixes error.
- plan-apply, plan-archive and docs describe `enter` then `finish`.

## Out of scope

Deleting the branch; running the repo build; pushing; merge strategies other than ff-only; `--after` for `step set`.

## Approach

Archive: add a `next` line in branch mode. Finish: new `finish.ts` reusing `git.ts` and the treehouse status lookup from `start.ts` (row tagged `[<slug>]`). Checks in order: on base branch, tree clean, branch `<slug>` exists and contains `specs/changes/archived/*-<slug>/proposal.md`, base is an ancestor of the branch. Then merge, then return (skipped with a note when no worktree is found; `return` also ends the lingering shell, so the hint to `exit` is not needed when launched via `enter`). Step add: extract the prefix resolver from `dep` in commands.ts. Alternatives: archive merges itself (rejected: archive runs inside the worktree, merge needs the main checkout); `finish` runs the repo build (rejected: repo-specific).

## Steps

- `01-archive-prints-follow-up-commands.md` - archive next line points at finish
- `02-step-add-accepts-prefix-ids.md` - prefix resolution for --after
- `03-finish-command.md` - ff-merge and treehouse return from main
- `04-skills-and-docs-use-finish.md` - skills and docs describe enter then finish

## Acceptance

- `npm test -w packages/change-axi` passes with new cases.
- `change-axi archive <slug> --dry-run` on a branch shows the finish line; `step add ... --after 01` stores the full id as the blocker.
- In a temp repo with an archived branch: `finish --dry-run` reports the plan; `finish` fast-forwards main and returns the worktree; `finish` on an unarchived or diverged branch errors without changing anything.
- `change-axi check polish-archive-and-step-add` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: finish example.
- `docs/architecture/plan-workflow.md` - update: finish ends the flow after archive.

## Risks and open questions

- Edits packages/change-axi/src/commands.ts, also edited by add-claim-done-commands; run sequentially.
- Worktree lookup depends on treehouse status output format (already relied on by start).
- Overlaps docs and plan-apply skill with add-claim-done-commands; apply it first.
- Whether `finish` should also delete the branch: left manual for now.
