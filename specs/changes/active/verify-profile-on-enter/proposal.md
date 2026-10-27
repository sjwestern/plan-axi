# Verify agent profile before enter launches

## Why

pi silently downgrades an invalid `--thinking` level: it prints a warning, exits 0 and runs at the default level. A profile with a bad effort therefore launches an agent at the wrong effort and nobody notices. An invalid model fails fast at launch, but only after the worktree is leased and the agent starts. `enter` already knows the resolved profile, so it can check it first and fail with a clear fix.

## Context

Docs: docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md. ADRs: ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (profiles, tiers, launch resolution), ADR-0006-agent-launch-uses-a-command-template. Code: packages/change-axi/src/commands.ts (enterCommand, resolveAgent call), packages/change-axi/src/agent.ts. Depends on change:add-config-cli, which adds the per-harness profile checks (checkProfile, verifyProfiles with ok, invalid and skipped results). Related: change:add-run-wave launches steps the same way and should call the same preflight.

## What changes

- `enter` runs the harness checks for the profile it resolved (tier profile or `--agent <name>`) before launching.
- `invalid` (for pi: effort not in the levels from `pi --help`, or model not an exact `provider/model` pair in `pi --list-models`) blocks the launch: non-zero exit, nothing started, a message naming the profile, field and valid values.
- `skipped` (harness binary missing, check call failed or timed out) prints a warning with the reason and launches anyway.
- With `--print` or no TTY nothing launches, so invalid results are warnings and the command is still printed.
- `--no-verify` skips the check.
- Effort is always checked (cheap). The model check uses a short timeout.
- The check is a shared helper (`preflightProfile`) so `change:add-run-wave` can call it before opening tabs.
- Agents resolved from `[apply] agent`, `CHANGE_AXI_AGENT` or autodetect are not profiles and are not checked.

## Out of scope

- Checking config at write time (change:add-config-cli does that).
- Caching `pi --list-models` results between runs.
- Wiring `run` itself; add-run-wave calls the helper when it lands.
- New harness adapters.

## Approach

Add src/preflight.ts: `preflightProfile(choice, runner?)` takes the AgentChoice from resolveAgent, returns nothing for non-profile choices, otherwise calls the add-config-cli harness check for that one profile and returns its results. enterCommand calls it after resolveAgent and before runAgent; invalid blocks, skipped goes to the help list. The runner is injected so tests need no pi binary.

Alternatives: (a) validate only at config write time - rejected, config can be hand-edited or become stale after a pi upgrade; (b) check on every show or status - rejected, `pi --list-models` is slow; (c) always block on skipped - rejected, a missing harness on a shared machine config should not stop a user who launches through another path.

Decision recorded by extending ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (launch resolution gains a preflight).

## Steps

- `01-preflight-helper-and-enter-wiring.md` - helper and enter integration
- `02-docs-adr-update-and-plan-apply-skill.md` - docs, ADR update, skill

## Acceptance

- `npm test` passes.
- With a profile whose effort is invalid, `change-axi enter <slug> <step> --run` exits non-zero, starts no agent, and names the profile, the field and the valid levels. With `--no-verify` it launches. With `--print` it prints the command and a warning.
- With a profile whose model is not an exact `provider/model` in the list, the same happens.
- With the harness missing from PATH, enter warns with the reason and still launches.
- A non-profile agent (`[apply] agent`, env, autodetect) launches with no check and no added output.

## Docs impact

- docs/domain/cli-quick-reference.md - update: enter preflight, `--no-verify`, invalid versus skipped.
- docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md - update: launch resolution includes a profile preflight.
- skills/plan-apply/SKILL.md - update: what the enter preflight failure means and how to fix it with `change-axi config`.

## Risks and open questions

- Open: cache `pi --list-models` for a short time to avoid the delay on every enter? Plan: no cache now; short timeout.
- Open: should `--no-verify` also be a config setting? Plan: no.
- Risk: launch latency from `pi --list-models`; mitigated by the timeout and by checking the model only when the profile sets one.
- Risk: overlap with change:add-run-wave on commands.ts if both are applied together; apply this change first or chain the steps with `change-axi dep`.
- Risk: depends on the check API from change:add-config-cli; do not apply before it is archived.
