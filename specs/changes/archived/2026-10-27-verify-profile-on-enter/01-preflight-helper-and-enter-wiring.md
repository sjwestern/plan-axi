# 01 - Preflight helper and enter wiring

Owns: packages/change-axi/src/preflight.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/preflight.test.ts, packages/change-axi/test/enter.test.ts
Docs: docs/decisions/0007-agent-profiles-and-step-tiers-extend-the-launch-template.md
Tier: standard

## Goal

`enter` checks the resolved profile before launching and blocks on invalid effort or model.

## Context

Tier standard: touches the launch path and a subprocess check. Uses the harness check from change:add-config-cli (results ok, invalid, skipped). enterCommand in commands.ts builds the agent with resolveAgent, then either runs it (TTY or --run) or prints it (--print or no TTY). ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template defines the resolution order.

## Work

1. preflight.ts: `preflightProfile(choice, runner?)`; non-profile choices return no results; otherwise return the check results for that profile only.
2. enterCommand: add `--no-verify` to ENTER_SPEC and help. After resolveAgent and before runAgent, run the preflight. If any result is invalid and the agent would run: throw a VALIDATION_ERROR naming profile, field, value and valid values, with a help line pointing to `change-axi config --profile ...` and `--no-verify`. Skipped results, and invalid results in print mode, go to the help list as warnings.
3. Keep output unchanged when there are no results.
4. Tests: invalid effort blocks run and does not call runAgent; `--no-verify`; print mode warns; invalid model; skipped warns and launches; non-profile agent unchanged; injected runner, no pi binary needed.

## Done when

`npm test` passes, including the new preflight and enter tests; the Acceptance cases hold with a fake runner.
