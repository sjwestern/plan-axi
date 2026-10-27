# Resolve a step on bare enter so its tier applies

## Why

When `change-axi enter <slug>` is run without a step, the launch has no step, so the step `Tier:` is never read and the agent falls back to `[apply] agent`, `CHANGE_AXI_AGENT` or autodetect. Configured tier profiles are silently ignored: a `small` step ran on the `standard` model in a real session. The launched `apply <slug>` session also loops over several steps on one model, so tiers cannot apply at all.

## Context

Docs: docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md. ADRs: ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (tier to profile resolution), ADR-0006-agent-launch-uses-a-command-template. Code: packages/change-axi/src/commands.ts (enterCommand: step resolution and tier lookup). Related: change:add-run-wave launches every step with an explicit step and tier already; change:verify-profile-on-enter edits the same function.

## What changes

- Bare `enter <slug>` resolves a step before launching, then uses the existing tier lookup and prompt `apply <slug> <step>`.
- One in-flight step: resume it (unchanged).
- Otherwise, exactly one ready step: pick it.
- Otherwise, several ready steps (a parallel wave): launch nothing, exit 0, and list the ready steps, each with tier and resolved profile, plus the commands `change-axi enter <slug> <step>` and (when it exists) `change-axi run <slug>`.
- No ready steps: existing message.
- `--agent <profile>` still overrides the tier. With several ready steps and no step it still lists and does not launch.
- The worktree is still leased or started as today when the change is not yet in flight; only the launch is withheld in the multi-step case.

## Out of scope

- The `run` wave launcher (change:add-run-wave).
- Changing how a step given explicitly is handled.
- Profile validation (change:verify-profile-on-enter).

## Approach

In enterCommand, extend the existing no-step branch: after the in-flight resume check, compute ready steps (queued, no blockers) with the same rule `status` uses, and set `step` when exactly one. For several, build the listing from each step file Tier header and tierProfile/resolveAgent, print it as TOON with help lines, and return before runAgent. Reuse, do not duplicate, the ready computation by lifting it from the status command into a helper.
Alternatives: (a) pick the first ready step silently - rejected, wrong model for parallel steps and hides parallelism; (b) warn only - rejected, still launches the wrong model; (c) leave as is - rejected, tiers ignored.
No new ADR; ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template launch resolution gets a sentence in the docs step.

## Steps

- `01-resolve-step-on-bare-enter-and-list-para.md` - resolve a step on bare enter, list parallel waves, tests
- `02-docs-and-plan-apply-skill-update.md` - docs, ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template sentence, plan-apply skill

## Acceptance

- `npm test` passes.
- Repo with `small` and `standard` tiers mapped: `change-axi enter <slug> --print` with one ready `small` step prints the small profile command with prompt `apply <slug> <step>`.
- With two ready steps, `enter <slug>` launches nothing and lists both with tier and profile.
- With one in-flight step, bare enter still resumes it.
- Explicit `enter <slug> <step>` and `--agent` behave as before.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: bare enter picks the single ready step or lists a wave.
- `docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md` - update: launch always has a step so the tier applies.
- `skills/plan-apply/SKILL.md` - update: first-agent hand-off names a step; `apply <slug>` loop wording.

## Risks and open questions

- Overlaps `commands.ts` with change:verify-profile-on-enter and change:add-run-wave; land in any order but rebase carefully.
- Open: should the multi-ready case offer an interactive pick on a TTY instead of listing? Default here: list only.
