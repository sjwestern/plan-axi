# Add medium model tier between small and standard

## Why

Step tiers are small, standard and deep. A gap sits between small and standard: steps too big for the cheapest model but not worth the standard model. Users want a medium model config to route those steps without over- or under-spending.

## Context

Docs read: docs/decisions/0007 (ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template), docs/domain/cli-quick-reference.md, docs/domain/glossary.md, README.md (config section). Code: packages/change-axi/src/spec.ts (TIERS), configcheck.ts, guidance.ts, configcmd.ts, commands.ts, check.ts, planconfig.ts.

## What changes

- New tier `medium`, ordered small < medium < standard < deep.
- `Tier: medium` is valid in step headers; `step add/set --tier medium` works.
- `[apply.tiers] medium = "<profile>"` and `[propose.tiers] medium = [...]` are valid; `change-axi config --tier medium=<profile>` and `--rule medium=...` work.
- `change-axi guidance` and `config` list medium between small and standard.
- Existing configs with only the three old tiers stay valid. Medium is optional with no fallback: an unmapped medium step gets the existing TIER_UNMAPPED warning and the normal non-tier agent resolution.
- plan-propose skill: when several rules match, the higher tier wins in the new order.

## Out of scope

- Renaming or removing existing tiers.
- Automatic fallback from medium to another tier.
- Changing launch resolution order or profile preflight.

## Approach

Tier names live in one list, `TIERS` in spec.ts. Make it the single source: add "medium" in order and replace hard-coded tier literals (guidance.ts initial map, help strings in commands.ts and configcmd.ts, spec.ts Tier guide) with values derived from TIERS. Extend tests that enumerate tiers. Then update docs and the plan-propose skill text. Alternative considered: name it "mid" or "balanced"; "medium" matches the user's wording and the size ordering. No new ADR: this extends ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template without changing its decision.

## Steps

- `01-add-medium-tier-to-code-and-tests.md` - add medium to TIERS, derive literals, extend tests.
- `02-update-docs-and-plan-propose-skill.md` - update docs, ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template text and plan-propose skill.

## Acceptance

- `npm test` passes, with new cases for medium in tier, config, configcheck, guidance and planconfig tests.
- `change-axi config --profile m --harness pi --model x/y --tier medium=m` writes valid config; `config --verify` and `guidance` show medium between small and standard.
- `change-axi step set <slug> <step> --tier medium` works; `check` accepts it and warns TIER_UNMAPPED only when unmapped.
- A config with only small/standard/deep still loads without warnings.

## Docs impact

- docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md - update: tier list includes medium.
- docs/domain/cli-quick-reference.md - update: tier lists and TIER_UNKNOWN text.
- docs/domain/glossary.md - update: Tier entry.
- README.md - update: config example mentions medium.
- skills/plan-propose/SKILL.md - update: tier choices and ordering for rule conflicts.

## Risks and open questions

- Medium-tier name is open; easy to change since TIERS is the single source.
- Hard-coded tier strings elsewhere may be missed; tests plus rg for "standard" cover it.
