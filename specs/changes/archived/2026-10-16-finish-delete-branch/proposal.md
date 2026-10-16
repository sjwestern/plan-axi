# finish --delete-branch

## Why

After `finish`, the merged branch stays and is deleted by hand with `git branch -d`. Branches accumulate (three were cleaned manually after the last batch). An opt-in flag removes the last manual step of finishing a change.

## Context

Docs read: `docs/architecture/plan-workflow.md`, `docs/domain/cli-quick-reference.md`. ADR 4 (plans on main, steps on a branch in a worktree). `finish` was added by the archived change polish-archive-and-step-add; the earlier plan listed branch deletion as out of scope and a risk.

## What changes

- `change-axi finish <slug> --delete-branch` runs `git branch -d <slug>` after the merge and worktree return. Without the flag nothing changes.
- Safe delete only (`-d`, never `-D`): git refuses an unmerged branch.
- `--dry-run` reports the planned deletion. Output gains `branch_deleted`.
- If the delete fails after the merge, `finish` still succeeds and reports a warning with the manual command.

## Out of scope

Deleting by default; force delete; deleting remote branches; a config key to make it the default (can follow if wanted).

## Approach

Add `deleteBranch` to `FinishOptions`; run `git branch -d` last, after `treehouse return` (a worktree on the branch would block the delete, so return must come first). Catch the failure into a `warnings` entry instead of throwing, since the merge already happened. Flag registered in FINISH_SPEC. Alternative: delete by default (rejected: user asked for an option).

## Steps

- `01-delete-branch-option.md` - flag, dry-run report, safe delete, warning on failure
- `02-document-the-option.md` - quick reference and plan-archive skill

## Acceptance

- `npm test -w packages/change-axi` passes with new finish cases.
- `finish <slug> --dry-run --delete-branch` shows the planned deletion and changes nothing.
- `finish <slug> --delete-branch` merges, returns the worktree and the branch is gone (`git branch`); without the flag the branch remains.
- `change-axi check finish-delete-branch` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: finish example with --delete-branch.

## Risks and open questions

- Delete must follow `treehouse return`; if return fails silently the branch delete warns, not errors.
- Whether to add a config default later.
