# Add change-axi claim and done

## Why

In the add-agent-launch trial, an agent ran the same two shell blocks for every step: claim (`tasks-axi start` plus reading the step doc) and finish (`tasks-axi done` plus a commit of only tasks.md). Both are mechanical, error-prone (wrong `--file`, committing other paths), and the Owns check is never enforced at finish time.

## Context

Docs read: `docs/architecture/plan-workflow.md` (Step execution), `docs/domain/cli-quick-reference.md`, `docs/architecture/package-structure.md`. ADRs: 1 (tasks-axi owns state), 4 (plans on main, steps in worktree), 5 (Owns = write set). tasks-axi facts in `.agent-memory/plan-axi.md`: `start` on a started task reports `already: true`; `start` on a done task reopens it.

## What changes

- `change-axi claim <slug> [step]`: picks the step (or first ready step), runs `tasks-axi start`, prints `already: true` when another agent holds it, refuses a done step, prints the step doc (Goal, Context, Work, Done when) and its Owns.
- `change-axi done <slug> <step>`: runs `tasks-axi done`, commits only that plan's `tasks.md` as `done <step>`, and warns (does not fail) when commits since the previous tasks.md commit touched paths outside the step's Owns.
- plan-apply uses both instead of hand-run blocks.

## Out of scope

Auto-committing the step's own work; blocking on Owns violations (warning only); `next`/`prompt` commands; `step rm`; fixing tasks-axi upstream.

## Approach

New modules `claim.ts` and `done.ts` reuse `tasks.ts` (`runTasks`, `listTasks`), `git.ts`, and the spec reader in `change.ts`. Each registered in `cli.ts` with a `CmdSpec` per CONTRIBUTING. Claim guards: step must be in the plan and not done; ready = no active blockers. Done commits with a pathspec so unrelated staged files stay out. Owns glob match reuses `check.ts` matching. Baseline for the warning: last commit touching `tasks.md`; `--since <rev>` overrides. Alternatives: store HEAD at claim in the task body (rejected: extra tasks-axi writes); fail on Owns violation (rejected: legit edits like lockfiles).

## Steps

- `01-claim-command.md` - claim with already/done guards and step doc output
- `02-done-command.md` - done, tasks.md-only commit, Owns warning
- `03-skills-and-docs-use-claim-and-done.md` - apply skill and docs switch to the commands

## Acceptance

- `npm test` passes with new claim/done tests (fake tasks-axi not needed; helpers use the real one).
- In a temp plan: `claim` twice reports `already: true`; `claim` on a done step errors; `done` creates a commit touching only tasks.md; editing a file outside Owns then `done` prints a warning.
- `change-axi check add-claim-done-commands` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: claim and done examples.
- `docs/architecture/plan-workflow.md` - update: Step execution uses claim/done.

## Risks and open questions

- Baseline for the Owns warning is wrong with parallel steps in one worktree (other step's commits appear); warning wording says "may".
- Overlaps cli-quick-reference with bootstrap-fresh-worktrees; merge sequentially.
- Both changes edit src/cli.ts and src/commands.ts with polish-archive-and-step-add (commands.ts); run sequentially or rebase.
