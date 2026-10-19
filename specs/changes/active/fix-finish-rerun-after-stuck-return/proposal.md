# Make finish resumable after a stuck treehouse return

## Why

When `treehouse return` finds live processes (usually an editor), it resets the slot before failing: the slot stays leased but detached with no branch label. `change-axi finish` finds the worktree by branch label, so a rerun fails with NOT_FOUND. The earlier fix only turned the first failure into a warning that says the rerun is safe; it is not. The user must clean up by hand.

## Context

Docs: architecture/plan-workflow.md, domain/cli-quick-reference.md. No ADRs apply. Code: packages/change-axi/src/finish.ts, start.ts (statusRows, parseStatusRows, lease), tests finish.test.ts, flow.test.ts, status-rows.test.ts, start.test.ts.

## What changes

- start and enter lease the worktree with `--lease-holder <slug>`.
- statusRows reads `treehouse status --json` (name, path, branch, lease_holder, status), with the text parser as fallback.
- finish finds the worktree by branch label, then by lease_holder equal to the slug.
- finish is resumable: if the branch is already merged and archived, it skips archive and merge, retries `treehouse return <name>`, and deletes the branch when --delete-branch is set.
- If no worktree is found and the branch is merged and archived (old lease with no holder), finish succeeds with a warning giving `treehouse status` and `treehouse return <name>`.
- A branch that is not merged keeps the NOT_FOUND error.
- The stuck-return warning names the slot (`treehouse return 1`) and says rerunning finish completes the job.

## Out of scope

Killing processes, changing treehouse, auto-detecting leftover slots that have no lease holder.

## Approach

The lease holder survives the reset done by return, so it identifies the slot on rerun. finishChange is reordered: resolve the worktree (label, then holder), then branch on merged/archived state to skip completed phases, then return and delete. Alternatives: return before the ff-merge (a failed return would block the merge); match any detached leased slot (ambiguous with several slots).

## Steps

- `01-lease-holder-and-json-status.md` - lease with slug holder, JSON status rows
- `02-resumable-finish.md` - finish finds the slot by holder and resumes
- `03-docs.md` - update docs

## Acceptance

Tests with a fake treehouse whose return fails once and leaves the slot detached with lease_holder=<slug>: first finish merges and warns with the slot name; second finish returns the slot, deletes the branch with --delete-branch, and does not archive or merge again. A holder-less slot gives the manual hint and exits cleanly. Run `npm test`.

## Docs impact

- docs/architecture/plan-workflow.md - update: finish is resumable, lease holder identifies the slot.
- docs/domain/cli-quick-reference.md - update: finish rerun behavior.

## Risks and open questions

- Slots leased before this change have no holder and need a manual `treehouse return <name>` once.
- Older treehouse without `--lease-holder` or status --json: fall back to current behavior.
