# 04 - Skills and docs use finish

Owns: skills/plan-apply/SKILL.md, skills/plan-archive/SKILL.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md
Docs: none

## Goal

plan-apply, plan-archive and docs describe `change-axi enter` followed by `change-axi finish`.

## Context

enter runs the agent as a child process with the worktree as cwd, so no treehouse shell is needed. add-claim-done-commands also edits plan-apply and docs; apply it first and resolve overlaps.

## Work

1. plan-apply: launch with `change-axi enter <slug>` from main (no `treehouse enter`); mention `finish` as the last step.
2. plan-archive: after `archive --commit` on a branch, tell the user to run `change-axi finish <slug>` from the main checkout.
3. cli-quick-reference and plan-workflow: add finish via `docs-axi write`.

## Done when

`grep -n 'finish' skills/plan-archive/SKILL.md skills/plan-apply/SKILL.md` matches; `docs-axi check` passes.
