# 04 - Skills and docs use finish

Owns: skills/plan-apply/SKILL.md, skills/plan-archive/SKILL.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md
Docs: none

## Goal

plan-apply, plan-archive and docs describe `change-axi enter` followed by `change-axi finish`.

## Context

enter runs the agent as a child process with the worktree as cwd, so no treehouse shell is needed. add-claim-done-commands also edits plan-apply and docs; apply it first and resolve overlaps.

## Work

1. plan-apply: launch with `change-axi enter <slug>` from main (no `treehouse enter`); the last step is `change-axi finish <slug>` from main, which archives if needed.
2. plan-archive: `archive` stays documented; after `archive --commit` on a branch, or instead of it, run `change-axi finish <slug>` from the main checkout. Suggest `finish --dry-run` to review accepted ADRs and `--no-archive` to require a deliberate archive first.
3. cli-quick-reference and plan-workflow: add finish (with --dry-run and --no-archive) via `docs-axi write`.

## Done when

`grep -n 'finish' skills/plan-archive/SKILL.md skills/plan-apply/SKILL.md` matches; `docs-axi check` passes.
