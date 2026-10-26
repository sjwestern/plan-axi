# 03 - Add change-axi config command

Owns: packages/change-axi/src/configcmd.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/guidance.ts, packages/change-axi/test/config.test.ts, packages/change-axi/test/guidance.test.ts
Docs: none
Tier: standard

## Goal

`change-axi config` shows the effective plan config and sets profiles, tiers, rules, default tier, agent and commit style, in the repo file or the user file with `--user`.

## Context

Tier standard: new command wiring, flags and file writes. Mirror docs-axi config (show with no flags, write with flags, show result after). The guidance.ts edit makes guidance show resolved model/effort per tier, list valid pi effort levels and the agent fallback order (--agent, tier, [apply] agent, CHANGE_AXI_AGENT, autodetect) in --help, and point to `change-axi config`. Commit the current uncommitted guidance --help edits in the working tree first.

## Work

1. configcmd.ts: CONFIG_SPEC and configCommand. Flags: --profile --harness --model --effort --command, --tier <tier>=<profile> (repeatable), --rule <tier>=text (append, repeatable), --clear-rules <tier>, --default-tier, --agent, --commit-type/--commit-scope/--commit-plan-type/--commit-trailer, --remove-profile, --unset-tier, --user, --force, --verify.
2. Build edits with docs-axi/lib/tomlwrite and validate with planconfig. Structural errors and harness results with status invalid are errors: exit non-zero, leave the file unchanged, and say `--force` writes anyway (the model list covers only providers with credentials on this machine). A `--model` without a provider is also invalid; the error lists the matching `provider/model` values. Status skipped (harness missing, call failed) writes the file and prints a warning with the reason. `--force` downgrades invalid to a warning; it never bypasses structural errors.
3. `--verify [--profile <name>]`: no writes. Run planconfig verifyProfiles and print one row per profile (profile, status ok|invalid|skipped, reason). Exit non-zero if any is invalid; skipped is a warning. Reject combining --verify with write flags. Plain show and `check` run no live checks; show prints a hint to run `change-axi config --verify` when any profile uses a harness.
4. Register in commands.ts and cli.ts (top-level help list).
5. Update guidance output and help: show resolved model/effort per tier, list valid effort levels (from planconfig, pi --help parse with fallback) and the agent fallback order, point to `change-axi config`.
6. Tests in config.test.ts: write, show, structural errors, invalid error, --force, skipped warning, --verify (ok, invalid exit code, skipped, one profile, rejects write flags), --user with XDG_CONFIG_HOME temp dir.

## Done when

`npm test` passes; the Acceptance command from the proposal produces the expected TOML and output in a temp repo; invalid model or effort exits non-zero and leaves the file unchanged unless --force; a missing harness warns and still writes.
