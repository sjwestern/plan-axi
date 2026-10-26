# Add change-axi config to show and set plan config

## Why

Models, effort, tiers and tier rules are configured by hand-editing .plan-axi.toml. Agents cannot discover the schema from the CLI, so they search source code to find it, and a typo fails late. docs-axi already has `config` to show and set the docs layout; change-axi has no equivalent for apply and propose settings. A config CLI makes setup discoverable and safe for agents and humans.

## Context

Docs: docs/architecture/package-structure.md, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md. ADRs: ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (profiles, tiers), ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type (config write precedent: docs-axi config). Code: packages/docs-axi/src/configwrite.ts (line-preserving TOML upsert plus validate-by-load), packages/docs-axi/src/commands/config.ts, packages/change-axi/src/agent.ts (loadProfiles, resolveAgent), guidance.ts, commitstyle.ts. Related: change:add-run-wave (consumes profiles).

## What changes

- New `change-axi config`: with no flags, shows the effective plan config (profiles with harness/model/effort/command, tier -> profile map, tier rules, default_tier, apply.agent, commit style) and which tier lacks a profile.
- Flags set values in the repo .plan-axi.toml (`--user` writes the user config instead): `--profile <name> [--harness h] [--model m] [--effort e] [--command c]`, `--tier <tier>=<profile>`, `--rule <tier>="text"` (repeatable, appends), `--default-tier <tier>`, `--agent "<template>"`, `--commit-type/--commit-scope/...`. Removal: `--remove-profile <name>`, `--unset-tier <tier>`. `--force` overrides harness validation errors.
- Writes preserve comments and other tables and are validated before saving. Structural problems (unknown tier, tier mapped to an undefined profile, profile with neither harness nor command) are errors. Harness checks run per harness (pi first): effort is checked against the levels in `pi --help` and the model, which must be an exact `provider/model` pair, against `pi --list-models`. A value pi would reject is an error on write, overridable with `--force`. If the harness binary is missing or the check cannot run, the write succeeds with a warning saying the profile cannot launch on this machine. Plain `change-axi config` (show) and `check` run no live checks.
- Shared TOML upsert and validate code moves from docs-axi/configwrite.ts to an exported lib so both CLIs use it.
- `guidance` stays read-only, shows resolved model/effort per tier, and points to `change-axi config`. Its --help lists valid pi effort levels and the agent fallback order.
- plan-propose, plan-apply and docs point to `change-axi config` for setup.
- `change-axi config --verify [--profile <name>]` re-runs the harness checks on the existing config without writing: each profile is ok, invalid or skipped with a reason; exit non-zero if any is invalid, skipped is a warning. Show mode hints at it when any profile uses a harness (no verification state is stored). Use it after installing a harness, authenticating, or upgrading pi.

## Out of scope

- New tiers beyond small/standard/deep.
- New harness adapters (pi stays the only built-in).
- Interactive prompts or a wizard.
- Moving docs layout config: `docs-axi config` keeps it.

## Approach

Extract generic helpers (upsertKey, comment-safe quoting, table removal, validate-before-write taking a validator callback) from docs-axi configwrite.ts into docs-axi/lib/tomlwrite. docs-axi config keeps its behavior and tests. change-axi gets src/configcmd.ts (parse flags, build edits, apply, render) and src/planconfig.ts (read model combining loadProfiles, the tier map, guidance rules and commit style, plus validation). Validation runs on the candidate text: parse, every profile has harness or command, tier map keys are valid tiers and values are defined profiles, default_tier is valid.

Alternatives: (a) write flags on `guidance` - rejected, a read command that writes is surprising and does not mirror docs-axi; (b) scaffold-only `--init` - rejected, does not help later edits; (c) a shared top-level `plan-axi config` binary - rejected, adds a third binary.

Target file: repo by default, `--user` for personal model choices since models are often per person.

Decision: recorded by extending ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (no new ADR). change-axi owns apply/propose/commit config writes, docs-axi owns the docs layout, and both share the TOML writer.

## Steps

- `01-extract-shared-toml-writer-into-docs-axi.md` - shared TOML writer lib
- `02-plan-config-model-and-validation.md` - read model and validation
- `03-add-change-axi-config-command.md` - the command and guidance updates
- `04-docs-adr-and-skills.md` - docs, ADR update, skills

## Acceptance

- `npm test` passes, including existing docs-axi config tests unchanged.
- In a temp repo: `change-axi config --profile small --harness pi --model p/m --effort low --tier small=small --rule standard="db migrations" --default-tier small` writes the expected TOML, keeps existing comments and [docs] settings, and `change-axi config` plus `change-axi guidance` show it.
- Mapping a tier to an undefined profile, an unknown tier, and a profile without harness/command each exit non-zero and leave the file unchanged.
- `--user` writes only the user config (XDG path, honoring XDG_CONFIG_HOME).
- `change-axi check` has no TIER_UNMAPPED after the example runs.
- `change-axi config --verify` on a config whose harness is not on PATH prints skipped with the reason and exits 0; with an invalid model or effort it prints invalid and exits non-zero; with a valid config (pi available) it prints ok. It never modifies the file.

## Docs impact

- docs/domain/cli-quick-reference.md - update: add `change-axi config` and make it the primary setup path over hand-editing TOML.
- docs/architecture/package-structure.md - update: shared TOML writer lib.
- docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md - update: config is shown and set through `change-axi config` (`--user` for personal choices), writes are validated, change-axi owns apply/propose/commit config while docs-axi config keeps the docs layout (ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type).
- skills/plan-propose/SKILL.md and skills/plan-apply/SKILL.md - update: point to `change-axi config` for model setup.

## Risks and open questions

- Open: should `--rule` append or replace? Plan: append, with `--clear-rules <tier>`.
- Open: include commit style flags now or later? Plan: include, they share the table pattern.
- Decided: harness checks are per harness and return ok, invalid or skipped; they run on write and on `config --verify`. Invalid pi model or effort is a write error (override with `--force`); a missing harness or failed check is a warning, not a silent pass. Show mode and `check` run no live checks. Pi silently downgrades an invalid `--thinking`, so the effort check is the only early signal; an invalid `--model` would fail at launch.
- Risk: `pi --list-models` covers only providers with credentials on this machine, so a valid model for another machine is rejected; mitigated by `--force` and a clear error message.
- Decided: pi models are validated as exact `provider/model` pairs. The same id can exist under several providers and the list search is fuzzy, so bare ids and substring hits are invalid, and the error lists candidate pairs.
- Risk: `pi --list-models` may be slow or need the network; run it only when a model is written, with a short timeout; a timeout is skipped with a warning.
- Risk: pi help or list formats can change; parsing falls back to a hardcoded effort list and the model check is skipped with a warning if output is not parseable.
- Risk: rewriting a hand-edited file; mitigated by line-preserving upsert and validation before write.
- Risk: uncommitted guidance --help edits in the working tree overlap step 03 Owns; commit them first.
