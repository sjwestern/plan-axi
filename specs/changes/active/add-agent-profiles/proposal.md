# Agent profiles and step tiers

## Why

`change-axi enter` runs one agent command for every step. To use a smaller model for small or parallel steps you retype `CHANGE_AXI_AGENT='pi --model ... {prompt}'` each time. Plans should say which steps suit a smaller model, and config should map that to a concrete harness, model and effort, so the controller does not choose by hand.

## Context

Docs read: `docs/decisions/0006-agent-launch-uses-a-command-template.md`, `docs/domain/cli-quick-reference.md` (Agent config), `docs/architecture/plan-workflow.md`, `docs/domain/glossary.md`. ADR 6 applies (template stays as the escape hatch). Code: `packages/change-axi/src/agent.ts`, `enter` in `commands.ts`, `loadRawConfig` in `docs-axi/src/config.ts` (flat `table.key` map, arrays unioned). Reference only: firstmate's `config/crew-dispatch.json` (rules map task kinds to harness/model/effort).
In flight: `configurable-docs-layout` edits `commands.ts`, `spec.ts`, `setup.ts`, the plan skills, README and the quick reference. Apply this change after it finishes, or expect rebase conflicts in those files.

## What changes

- `.plan-axi.toml` gains profiles: `[apply.agents.<name>]` with `harness`, `model`, `effort` (optional `command` template overrides the built command).
- Pi is the only built-in harness adapter: `model` -> `--model`, `effort` -> `--thinking`. Unknown harness without `command` is a clear error. More harnesses are later additions.
- `[apply.tiers]` maps a tier (`small`, `standard`, `deep`) to a profile name.
- Steps carry an optional `Tier:` header line, editable by hand during plan review. `change-axi step add|set --tier`.
- `change-axi enter <slug> [step] --agent <profile>`. Resolution order: `--agent`, the step's tier, `[apply] agent`, `CHANGE_AXI_AGENT`, autodetect. Output shows the profile used and why.
- `[propose.tiers]` holds user guidance (arrays of plain-language rules per tier, for example small = ["docs-only edits"], standard = ["changes that touch db migrations"]). `change-axi guidance` prints it; `plan-propose` reads it and sets a suggested `Tier:` per step with a one-line reason.
- `check` warns on a tier with no mapping or an unknown tier name.

## Out of scope

Launching steps in herdr or running a wave (change `add-run-wave`). Harness adapters other than pi. Automatic model choice at apply time. Quota or cost awareness. Changing the existing `[apply] agent` template behavior.

## Approach

A profile is data (`harness`, `model`, `effort`); `agent.ts` gains `buildProfileCommand(profile, prompt)` returning one shell command, so `enter` and the later `run` share it. Resolution stays deterministic: only the initial `Tier:` value comes from agent judgment (`plan-propose`), and a human can edit it in review. Tier guidance is plain text in config read through a CLI command, so skills never parse TOML (ADR 3 style).
Alternatives: (a) per-step raw model names in the plan - rejected, plans would hard-code machine-specific models; tiers keep plans portable. (b) firstmate-style natural-language rules resolved at launch - rejected, nondeterministic at the point where the human is the controller; judgment happens once, at proposal time. (c) `{model}` placeholder in the template only - rejected, does not cover effort or other harnesses.
Decision: new ADR extending ADR 6 with profiles and tiers.

## Steps

- `01-profile-config-and-enter-agent.md` - profiles in config, pi adapter, `enter --agent`
- `02-step-tier-field-and-tier-resolution.md` - `Tier:` step header, tier-to-profile resolution, check warnings
- `03-tier-guidance-command-and-propose-skill.md` - `change-axi guidance` and `plan-propose` sets suggested tiers
- `04-docs-and-adr.md` - docs and ADR 7

## Acceptance

- `npm test` passes.
- With a profile `small` in `.plan-axi.toml`, `change-axi enter <slug> <step> --agent small --print` prints `pi --model <m> --thinking <e> '<prompt>'` and `agent: small (--agent)`.
- A step with `Tier: small` and `[apply.tiers] small = "small"` uses that profile without `--agent`; `--agent` overrides it.
- Unknown `--agent` name errors and lists defined profiles.
- With no profiles or tiers configured, `enter` output is unchanged.
- `change-axi guidance` prints the effective rules; `change-axi check` warns on an unmapped tier.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: profiles, tiers, `--agent`, `--tier`, `guidance`
- `README.md` - update: config example
- `docs/domain/glossary.md` - update: Profile, Tier
- `docs/architecture/plan-workflow.md` - update: propose sets tiers, apply resolves them
- `docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md` - new ADR (renumber if `configurable-docs-layout` lands first)
- `skills/plan-propose/SKILL.md` - update in step 03

## Risks and open questions

- Conflicts with `configurable-docs-layout` (see Context): apply after it.
- Pi flag names (`--model`, `--thinking`, levels off|minimal|low|medium|high|xhigh|max) come from `pi --help` on this machine; effort values are passed through, not validated.
- TOML parser is a subset; confirm dotted tables like `[apply.agents.small]` flatten to `apply.agents.small.model` in `loadRawConfig` (step 1 adds a test).
- ADR number 0007 is also planned by `configurable-docs-layout`; renumber with docs-axi at apply time if needed.
