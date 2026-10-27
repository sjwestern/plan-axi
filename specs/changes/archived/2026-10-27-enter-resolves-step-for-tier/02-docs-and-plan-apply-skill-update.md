# 02 - Docs and plan-apply skill update

Owns: docs/domain/cli-quick-reference.md, docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md, skills/plan-apply/SKILL.md
Docs: none

## Goal

Docs and skill match the new bare enter behavior.

## Context

Use docs-axi to edit docs. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template is accepted: add a short consequence sentence, do not rewrite it. Skill edits go in skills/plan-apply/SKILL.md in this repo.

## Work

1. cli-quick-reference: describe bare enter (single ready step picked, several listed).
2. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template: note that launches always carry a step so tiers apply.
3. plan-apply skill: first-agent hand-off is `apply <slug> <step>`; note bare `enter` lists a wave.

## Done when

`docs-axi check` passes; the three docs describe the same behavior as the code.
