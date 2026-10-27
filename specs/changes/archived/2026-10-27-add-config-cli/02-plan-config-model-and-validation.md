# 02 - Plan config model and validation

Owns: packages/change-axi/src/planconfig.ts, packages/change-axi/src/agent.ts, packages/change-axi/test/planconfig.test.ts, packages/change-axi/test/profiles.test.ts
Docs: docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md
Tier: standard

## Goal

A single read model of plan config plus validation rules (structural errors and live harness checks), independent of the CLI.

## Context

Tier standard: new logic with validation rules and subprocess calls. Reuses loadProfiles and the pi adapter (agent.ts), loadGuidance (guidance.ts), commitStyle (commitstyle.ts), tierProfile (spec.ts). Merged user+repo config via loadRawConfig. Tiers: small, standard, deep.

Pi behavior observed (verify against the installed pi when implementing):
- `pi --list-models [search]` prints a table (provider, model, context, max-out, thinking, images) of every model from providers with credentials (not limited to the `enabledModels` setting, which only controls Ctrl+P cycling; one setup lists 339 models, 315 of them from one aggregator provider). The same model id can appear under several providers. It exits 0 even with no match and prints `No models matching`, so parse the output. Search is fuzzy and matches substrings, so never accept a fuzzy hit.
- `pi --help` lists thinking levels on the `--thinking` line (off, minimal, low, medium, high, xhigh, max). No machine-readable command exists.
- Invalid `--model`: error, exit 1, nothing runs. Invalid `--thinking`: warning only, exit 0, runs at the default level (silent downgrade), so validating effort at config time matters.

Policy: structural problems are errors. Harness checks return one of ok, invalid, or skipped and the CLI decides what to do. `invalid` (pi ran and the model or effort is not valid) is an error on write, overridable with `--force`. `skipped` (harness binary not on PATH, call failed or timed out, output not parseable) is a warning with a reason, never a silent pass: an unavailable configured harness means the profile cannot launch on this machine, so say so. Live checks run on write and on `config --verify`, not on plain show or `check` (they can be slow). `--verify` reports invalid and skipped without failing the shared config itself: only invalid exits non-zero.

## Work

1. planconfig.ts: readPlanConfig(root) returns profiles, tier map, rules, default_tier, apply.agent, commit style, and per-tier resolved profile (model, effort).
2. validatePlanConfig(candidateText) - structural errors: every profile has harness or command; tier map keys are valid tiers and values are defined profiles; default_tier valid.
3. Harness checks in the adapter registry (agent.ts): each adapter may supply `checkProfile(profile)` returning a list of results `{ status: ok|invalid|skipped, field, message }`. Pi adapter: harness binary must be on PATH (else skipped: "pi not found on PATH; profile <name> cannot launch on this machine"); effort must be in the levels parsed from `pi --help` (fallback to the hardcoded list if parsing fails); model must be written as `provider/model` and equal the `provider` and `model` columns of one row from `pi --list-models <model>` (exact, case-sensitive comparison of both columns; no substring, fuzzy or bare-id match). A bare id with no provider is invalid: the id can exist under several providers, so the message lists the matching `provider/model` values to choose from. A model not in the list is invalid and, when the search returns close rows, the message suggests them. Call failure, timeout or unparseable output is skipped with the reason. Profiles with a `command` template: check that the command's first word is on PATH (skipped otherwise), nothing else.
4. Run live checks for profiles being written and for `config --verify` (all profiles, or one), never on plain show or `check`. Expose `verifyProfiles(root, names?)` returning the per-profile results. Expose pure functions that take command output so tests need no pi binary; inject the runner and PATH lookup.
5. Unit tests (include: same id under two providers, bare id, substring-only hit, case mismatch, large output): each structural error; effort valid/invalid; model found/not found/no-match output; pi missing; timeout; unparseable output; command-template profile.

## Done when

planconfig and profile tests pass without a pi binary on PATH: valid config returns the model; each structural error returns a specific VALIDATION_ERROR; invalid effort or unknown model returns status invalid; missing harness, failed call or timeout returns status skipped with a reason.
