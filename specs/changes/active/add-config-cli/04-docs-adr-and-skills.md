# 04 - Docs, ADR update and skills

Owns: docs/domain/cli-quick-reference.md, docs/architecture/package-structure.md, docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md, docs/README.md, skills/plan-propose/SKILL.md, skills/plan-apply/SKILL.md
Docs: none
Tier: small

## Goal

Docs, an ADR and skills describe `change-axi config` as the way to set up models.

## Context

Tier small: prose edits. No new ADR: extend the accepted ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template in place (additive, no supersede).

## Work

1. cli-quick-reference.md: add change-axi config examples; show hand-editing TOML as secondary.
2. package-structure.md: shared tomlwrite lib.
3. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template: add to Decision that profiles, tier map, rules and default tier are shown and set through `change-axi config` (`--user` for personal choices); add to Consequences that writes are validated before saving and that change-axi config owns apply/propose/commit config while docs-axi config keeps the docs layout (ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type). Use `docs-axi write` by section.
4. plan-propose and plan-apply skills: run `change-axi config` (no flags) to see setup; set models with its flags.
5. Regenerate docs index: `docs-axi index`.

## Done when

`docs-axi check` passes and the skills name `change-axi config`.
