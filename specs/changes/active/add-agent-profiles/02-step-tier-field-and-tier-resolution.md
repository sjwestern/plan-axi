# 02 - Step Tier field and tier resolution

Owns: packages/change-axi/src/spec.ts, packages/change-axi/src/check.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/tier.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

Steps carry an optional `Tier:` header; `enter` maps it to a profile through `[apply.tiers]`; `check` flags bad tiers.

## Context

Step headers `Owns:` and `Docs:` are parsed with `headerLine` and written with `setLine` in `stepSet` (`commands.ts`); `spec.ts` scaffolds the header. Tier names are fixed: `small`, `standard`, `deep`. `Tier:` is optional; a missing line means no tier (falls through resolution). `enter` runs in the worktree and must read the step file from there. Depends on step 01's `resolveAgent(root, { tierProfile })`.

## Work

1. `spec.ts`: step scaffold writes no Tier line by default (optional); document `Tier` in the step spec header guide.
2. `commands.ts`: `step add --tier` and `step set --tier <small|standard|deep|none>` (invalid value: `VALIDATION_ERROR`; `none` removes the line); show `tier` in the step output rows.
3. `agent.ts` or a small `tier.ts`: `tierProfile(root, tier)` reading `apply.tiers.<tier>`.
4. `enter` with a step: read the step's `Tier:` from `<worktree>/specs/changes/active/<slug>/<step>.md`, resolve to a profile, and pass `tierProfile`; provenance `(tier small -> small)`.
5. `check.ts`: warn `TIER_UNKNOWN` for a value outside the three names and `TIER_UNMAPPED` when `[apply.tiers]` is configured but lacks that tier or names an undefined profile.
6. `tier.test.ts`: header round trip, `--agent` beats tier, tier beats `[apply] agent`, warnings.

## Done when

`npm test` passes. `change-axi step set <slug> 01-x --tier small` adds `Tier: small`; `enter <slug> 01-x --print` then uses the mapped profile and says why; `change-axi check <slug>` warns for `Tier: huge`.
