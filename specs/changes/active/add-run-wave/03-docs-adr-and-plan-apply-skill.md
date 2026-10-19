# 03 - Docs, ADR and plan-apply skill

Owns: README.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, skills/plan-apply/SKILL.md, docs/decisions/0008-run-launches-ready-steps-as-herdr-tabs.md
Docs: none

## Goal

Docs and the plan-apply skill describe `run`; ADR 8 is filled.

## Context

ADR file `0008-run-launches-ready-steps-as-herdr-tabs.md` already exists (proposed); renumber with docs-axi if another change took the number first. Describe behavior as built in steps 01-02. The skill keeps `enter` for single steps and mentions `run` for parallel waves.

## Work

1. `docs/domain/cli-quick-reference.md`: `run` with flags, herdr requirement, print fallback.
2. `README.md`: short "Run a wave" paragraph after the `enter` paragraph.
3. `docs/architecture/plan-workflow.md`: run stops at each wave for human review; archive and finish stay manual.
4. `skills/plan-apply/SKILL.md`: from main or the worktree, a controller can `change-axi run <slug>`; agents in tabs follow Execute mode for their one step.
5. ADR 8 Context, Decision, Consequences reviewed against the built code.
6. `docs-axi check` clean.

## Done when

`docs-axi check` passes; `rg -n "change-axi run" README.md docs/ skills/` shows each doc updated.
