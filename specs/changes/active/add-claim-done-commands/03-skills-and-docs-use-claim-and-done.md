# 03 - Skills and docs use claim and done

Owns: skills/plan-apply/SKILL.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md
Docs: none

## Goal

plan-apply and docs use `claim` and `done` instead of hand-run blocks.

## Context

Skill currently documents `tasks-axi start/done` blocks and a commit-own-paths rule. Keep the rule for the step's own work commit; claim/done cover only task state. Note bootstrap-fresh-worktrees also edits plan-apply and cli-quick-reference; apply after it or resolve.

## Work

1. plan-apply: replace the claim and done blocks with `change-axi claim <slug> [step]` and `change-axi done <slug> <step>`; mention the Owns warning and that the step's own work is committed before `done`.
2. cli-quick-reference: add claim/done lines via `docs-axi write`.
3. plan-workflow Step execution: reword to claim, implement, verify, commit, done.

## Done when

`grep -n 'tasks-axi start\|tasks-axi done' skills/plan-apply/SKILL.md` returns nothing; `docs-axi check` passes.
