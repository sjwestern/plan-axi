# 02 - Docs, ADR update and plan-apply skill

Owns: docs/domain/cli-quick-reference.md, docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md, skills/plan-apply/SKILL.md
Docs: none
Tier: small

## Goal

Docs and the plan-apply skill describe the enter preflight.

## Context

Tier small: prose edits. Extend the accepted ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template in place; no new ADR.

## Work

1. cli-quick-reference.md: document the preflight, invalid versus skipped, `--no-verify`, and the fix command `change-axi config --verify`.
2. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template: add to Decision that launch resolution ends with a profile preflight (invalid blocks, skipped warns); add to Consequences the extra check on each enter and its timeout. Use `docs-axi write` by section.
3. plan-apply skill: if enter reports an invalid profile, fix it with `change-axi config` rather than editing the TOML or passing `--no-verify`.
4. `docs-axi index`.

## Done when

`docs-axi check` passes and the docs and skill describe the preflight.
