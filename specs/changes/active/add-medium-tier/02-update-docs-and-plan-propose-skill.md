# 02 - Update docs and plan-propose skill

Owns: README.md, docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md, docs/domain/cli-quick-reference.md, docs/domain/glossary.md, skills/plan-propose/SKILL.md
Docs: docs/domain/cli-quick-reference.md

## Goal

Document the medium tier and its ordering.

## Context

Docs list tiers as small/standard/deep in ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template, cli-quick-reference (step set line, TIER_UNKNOWN text), glossary Tier entry, README config example, plan-propose skill step 5. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template is accepted: edit the tier list only, no decision change. No tier set (no guidance configured).

## Work

1. Add medium to each tier list and the ordering small < medium < standard < deep.
2. Note in the quick reference that medium is optional and unmapped medium gives TIER_UNMAPPED.
3. plan-propose: pass `--tier <small|medium|standard|deep>`; higher tier wins in the new order.
4. Run `docs-axi check`.

## Done when

`rg -n 'small.standard.deep|small\|standard\|deep' docs README.md skills` finds no stale lists; `docs-axi check` and `change-axi check add-medium-tier --waves` pass.
