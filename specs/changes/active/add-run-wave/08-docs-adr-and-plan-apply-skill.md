# 08 - Docs, ADR and plan-apply skill

Owns: README.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, skills/plan-apply/SKILL.md, docs/decisions/0008-run-launches-ready-steps-as-herdr-tabs.md
Docs: none

## Goal

Docs and the plan-apply skill describe `run`, live `status`, `review`, `feedback` and `clean`; ADR-0008-run-launches-ready-steps-as-herdr-tabs covers the backend and viewer seams.

## Context

ADR file `0008-run-launches-ready-steps-as-herdr-tabs.md` exists (proposed); renumber with docs-axi if another change took the number first. Describe behavior as built in steps 01-07. The skill keeps `enter` for single steps and mentions `run` for parallel waves and `review`, `feedback`, `clean` for the human loop.

## Work

1. `docs/domain/cli-quick-reference.md`: each command with flags, the herdr requirement and the print fallback, the `live:` line, and `--no-live`.
2. `README.md`: short "Run a wave" and "Review" paragraphs after the `enter` paragraph.
3. `docs/architecture/plan-workflow.md`: run stops at each wave for human review; archive and finish stay manual; the review, feedback and clean loop.
4. `skills/plan-apply/SKILL.md`: a controller can `change-axi run <slug>`; agents in tabs follow Execute mode for their one step.
5. ADR-0008-run-launches-ready-steps-as-herdr-tabs Context, Decision, Consequences: launch backend, viewer seam with hunk, clean as the only tab-closing command; reviewed against the built code.
6. `docs-axi check` clean.

## Done when

docs-axi check passes; `rg -n "change-axi (run|review|feedback|clean)" README.md docs/ skills/` shows each doc updated.
