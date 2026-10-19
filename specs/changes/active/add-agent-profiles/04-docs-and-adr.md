# 04 - Docs and ADR

Owns: README.md, docs/domain/cli-quick-reference.md, docs/domain/glossary.md, docs/architecture/plan-workflow.md, docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md
Docs: none

## Goal

Docs describe profiles, tiers, `--agent`, `Tier:` and `guidance`; ADR 7 is accepted-ready.

## Context

The ADR file already exists (status proposed; `change-axi archive` accepts it). `configurable-docs-layout` also plans an ADR numbered 0007: whichever change lands second must renumber with docs-axi, never by hand-edit of numbers in prose elsewhere. Describe behavior as built in steps 01-03; read the final code before writing.

## Work

1. `docs/domain/cli-quick-reference.md`: extend "Agent config" with profiles, `[apply.tiers]`, `enter --agent`, resolution order; add `step set --tier` and `guidance`.
2. `README.md`: Config section gets `[apply.agents.*]`, `[apply.tiers]`, `[propose.tiers]` example.
3. `docs/domain/glossary.md`: add Profile and Tier.
4. `docs/architecture/plan-workflow.md`: propose sets tiers; apply resolves them.
5. ADR 7: fill Context, Decision, Consequences with real content (alternatives rejected: raw model names in plans, launch-time natural-language rules).
6. `docs-axi check` clean.

## Done when

`docs-axi check` passes and `rg -n "apply.tiers" README.md docs/` shows each doc updated.
