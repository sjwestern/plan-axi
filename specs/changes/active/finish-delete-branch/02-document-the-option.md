# 02 - Document the option

Owns: docs/domain/cli-quick-reference.md, skills/plan-archive/SKILL.md
Docs: none

## Goal

Docs and the archive skill mention `--delete-branch`.

## Context

cli-quick-reference has a finish line in the change-axi block. plan-archive skill tells the user to run finish from main after archiving.

## Work

1. `docs-axi write`/edit the finish example in cli-quick-reference to show `--delete-branch`.
2. plan-archive: one line that `finish <slug> --delete-branch` also removes the merged branch.

## Done when

`grep -n 'delete-branch' docs/domain/cli-quick-reference.md skills/plan-archive/SKILL.md` matches in both; `docs-axi check` passes.
