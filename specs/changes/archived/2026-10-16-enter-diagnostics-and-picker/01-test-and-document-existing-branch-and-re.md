# 01 - Test and document existing-branch and resume behavior

Owns: packages/change-axi/test/enter-branch.test.ts, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md
Docs: docs/architecture/plan-workflow.md

## Goal

Lock in the already-written existing-branch recovery and in-flight resume behavior of enter with tests and docs.

## Context

leaseWorktree (start.ts) deletes a branch with no commits beyond the default branch and recreates it, or leases without -b and runs git switch when the branch has work. When the comparison cannot be determined (rev-list fails) it throws VALIDATION_ERROR with the reason and guidance (inspect with git log, delete or switch manually); it never deletes in that case. enterCommand (commands.ts) picks the single in-flight step from the worktree tasks file when no step is given. All of this is committed on main before the plan, so step 01 only adds tests and docs. Tests need a fake treehouse on PATH (shell script printing JSON path) and a temp git repo.

## Work

1. Add packages/change-axi/test/enter-branch.test.ts: temp repo, fake treehouse; cases: branch equals main (recreated), branch behind main (recreated), branch with commit (switched, commit kept), undetermined comparison (error with guidance, branch untouched), branch in pool worktree (reused), switch failure gives GIT_ERROR.
2. Test resume: one in-flight step is chosen, zero or two are not.
3. Document both behaviors, including the undetermined-case guidance, in plan-workflow.md (enter section) and cli-quick-reference.md.

## Done when

npm test passes including the new file; docs-axi check passes.
