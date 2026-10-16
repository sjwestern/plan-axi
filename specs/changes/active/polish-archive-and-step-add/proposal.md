# Archive follow-up hints and step add prefix ids

## Why

Three slips from the add-agent-launch trial. After `archive --commit` on a branch the agent and user ran manual follow-ups (merge from the main checkout, release the worktree), and one user left a treehouse shell open after `treehouse return`. `step add --after 01` fails while `dep` accepts prefixes, an inconsistent rule agents trip on. Finishing a change by hand is several commands in the right order and place.

## Context

Docs read: `docs/domain/cli-quick-reference.md`, `docs/architecture/plan-workflow.md`. ADR 4 (plans on main, branch in worktree). Trial notes items 5 and 6 in `.agent-memory/plan-axi.md`. `treehouse --help` lists `return`, not `release`.

## What changes

- `archive` stays a separate command (run on the branch, or by hand). Its output on a branch includes one `next` line: `from the main checkout: change-axi finish <slug>`; nothing extra on main after merge.
- New `change-axi finish <slug> [--dry-run] [--skip-docs-check]`, run from the main checkout. If the change is not yet archived on branch `<slug>`, it runs archive (with commit) in that branch's worktree first and reports the ADRs it accepted; if already archived it skips that (archive by hand first for a review gate). `--dry-run` shows the archive result (ADRs, docs not updated), the merge and the return without changing anything. Then it requires a clean main tree and a fast-forwardable branch, runs `git merge --ff-only <slug>`, runs `treehouse return <worktree>` when a worktree exists, and prints the repo build hint. Needs no shell exit when the agent was launched with `change-axi enter`.
- `step add --after` accepts id prefixes (`01`) resolved like `dep`; ambiguous or unknown prefixes error.
- plan-apply, plan-archive and docs describe `enter` then `finish` (review with `finish --dry-run`).

## Out of scope

Merging archive into finish (they stay separate); deleting the branch; running the repo build; pushing; merge strategies other than ff-only; `--after` for `step set`.

## Approach

Archive: add a `next` line in branch mode; the command is otherwise unchanged. Finish: new `finish.ts` reusing `git.ts`, the treehouse status lookup from `start.ts` (row tagged `[<slug>]`) and the exported `archiveChange`, called with a ctx rooted at the worktree path and `commit: true`. Order: find worktree, check main is clean and on base, archive in the worktree if the branch lacks `specs/changes/archived/*-<slug>/proposal.md` (archive's own preflight enforces done tasks, clean worktree, Docs impact), verify base is an ancestor of the branch, merge, return. Nothing on main changes before the merge, so an archive failure leaves main untouched (the branch may hold the archive commit). `return` also ends the lingering shell, so no `exit` hint is needed when launched via `enter`. Step add: extract the prefix resolver from `dep` in commands.ts. Alternatives: archive merges itself (rejected: archive runs on the branch, merge needs the main checkout); `finish` runs the repo build (rejected: repo-specific).

## Steps

- `01-archive-prints-follow-up-commands.md` - archive next line points at finish
- `02-step-add-accepts-prefix-ids.md` - prefix resolution for --after
- `03-finish-command.md` - archive if needed, ff-merge and treehouse return from main
- `04-skills-and-docs-use-finish.md` - skills and docs describe enter then finish

## Acceptance

- `npm test -w packages/change-axi` passes with new cases.
- `change-axi archive <slug> --dry-run` on a branch shows the finish line; `step add ... --after 01` stores the full id as the blocker.
- In a temp repo with a branch whose steps are done but not archived: `finish --dry-run` reports archive (with ADRs), merge and return as planned and changes nothing; `finish` archives on the branch, fast-forwards main and returns the worktree. With the branch already archived, `finish` skips archiving.
- `finish` with unfinished tasks, a dirty main tree or a diverged branch errors; main `HEAD` is unchanged.
- `change-axi check polish-archive-and-step-add` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: finish example.
- `docs/architecture/plan-workflow.md` - update: finish ends the flow after archive.

## Risks and open questions

- Edits packages/change-axi/src/commands.ts, also edited by add-claim-done-commands; run sequentially.
- Worktree lookup depends on treehouse status output format (already relied on by start).
- Archive commits on the branch before the merge; if the merge then fails (diverged), the branch keeps the archive commit and main is untouched. Rerun `finish` after rebasing.
- Overlaps docs and plan-apply skill with add-claim-done-commands; apply it first.
- Whether `finish` should also delete the branch: left manual for now.
