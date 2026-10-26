# 03 - Tier guidance command and propose skill

Owns: packages/change-axi/src/guidance.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/guidance.test.ts, skills/plan-propose/SKILL.md
Docs: skills/plan-propose/SKILL.md

## Goal

Users state in `.plan-axi.toml` which kinds of work need which model tier, and `plan-propose` applies that guidance when it writes steps.

## Context

Guidance lives in `[propose.tiers]`: `small = [...]`, `standard = [...]`, `deep = [...]`, each an array of plain-language rules (arrays are unioned across user and repo config by `loadRawConfig`). Skills must read it through the CLI, not TOML. Example rule: standard = ["changes that touch db migrations"]. Tiers are suggestions the human edits in review; unmatched steps get no Tier line or the user's default tier from `[propose] default_tier`. Depends on step 02 (`--tier`).

## Work

1. `src/guidance.ts`: `loadGuidance(root)` returns `{ default_tier?, tiers: {small, standard, deep} -> string[] }`.
2. `change-axi guidance` in `commands.ts` and `cli.ts`: TOON output listing rules per tier, the default tier, and the profile each tier maps to (from `[apply.tiers]`) so the reader sees the cost. No config: prints a hint with an example block, exit 0.
3. `skills/plan-propose/SKILL.md`: in "Add steps", run `change-axi guidance` once; for each step pick the tier whose rules match the step's work (when several match, the higher tier), set it with `step add --tier` and put a one-line reason in the step's Context. Say in the report which steps got which tier and why. If there is no guidance, skip tiers.
4. `guidance.test.ts`: parsing, union of user and repo, empty config output.

## Done when

`npm test` passes. With `[propose.tiers] standard = ["db migrations"]`, `change-axi guidance` lists that rule under standard. `skills/plan-propose/SKILL.md` instructs running `change-axi guidance` and setting `--tier`; a manual run of the skill on a sample step touching `migrations/` suggests `standard`.
