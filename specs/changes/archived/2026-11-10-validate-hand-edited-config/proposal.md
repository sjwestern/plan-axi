# Validate hand-edited config with config --verify

## Why

Users hand-edit `.plan-axi.toml` and the user config, but nothing validates the result. Bad tier maps, bad `[commit]` values, typos in key names and broken agent templates pass silently or crash later in an unrelated command. `change-axi config --verify` only live-checks profile models, so it cannot answer "is my edited config valid?".

## Context

- Docs read: `docs/domain/cli-quick-reference.md`, `docs/architecture/package-structure.md`.
- ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (config validation on write, `--verify`), ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type (`[docs]` layout is config).
- Code: `packages/change-axi/src/planconfig.ts` (`planConfigProblems`, `verifyProfiles`), `configcmd.ts`, `commitstyle.ts`, `agent.ts`; `packages/docs-axi/src/config.ts` (`loadConfig`, `resolveLayout`).

## What changes

- `change-axi config --verify` becomes the one command that validates all config: user file and repo file each on their own, then the merged view.
- Problems print as a `problems` table (`file`, `key`, `severity`, `message`) above the existing profile rows. Errors exit 1; warnings exit 0.
- Checks: TOML syntax, unknown keys (warning, with a did-you-mean hint), value types, `[commit]` values, `[propose]`/`[apply.tiers]`/`[repos.*]` rules, and `[docs]` layout (validated by docs-axi).
- `apply.agent` and profile `command` templates must contain `{prompt}` (error); unknown `{placeholders}` warn. Harness profiles are exempt.
- Cross-file references (a repo tier mapped to a profile defined in the user file) resolve on the merged view; a failure names the file holding the bad key.
- Live checks are unchanged (missing binary stays `skipped`). `--verify --profile <n>` still runs all config validation and limits only the live checks.
- `config` writes reuse the same per-file checks.

## Out of scope

- Validating `CHANGE_AXI_AGENT` (env, not config).
- Validating docs content (`docs-axi check` stays the docs folder check).
- Auto-fixing or rewriting config.
- New config keys.

## Approach

- New `packages/change-axi/src/configcheck.ts`: a schema of known keys with type and value rules, `checkFile(path, raw)` returning `{file, key, severity, message}` problems, and `checkMerged(files)` for cross-file references. `planConfigProblems` is replaced by it so write-time and verify-time checks cannot drift.
- docs-axi exports `docsConfigProblems(root)` from `docs-axi/lib/config`: the existing `resolveLayout`/`loadConfig` checks, returned as problems with the file from `origin` instead of throwing on the first one.
- `verifyRows` in `configcmd.ts` runs the checks, prints the table, then the profile rows.
- Alternative considered: validate only the merged view. Rejected: it cannot say which file a bad value is in.
- Alternative considered: unknown keys as errors. Rejected: an older binary would hard-fail on a newer config.

## Steps

- `01-add-per-file-config-checker.md` - per-file and merged config checker
- `02-export-docs-config-problems-from-docs-ax.md` - docs-axi exports located `[docs]` problems
- `03-wire-checks-into-config-verify.md` - `config --verify` prints problems table
- `04-update-docs.md` - docs

## Acceptance

- `npm test` passes, including new tests per check and a two-file (user + repo) case.
- Hand-edit a repo file with a bad tier, a typo key, a bad `[commit] type`, and an agent template without `{prompt}`: `node packages/change-axi/dist/bin/change-axi.js config --verify` lists each with the right file and exits 1.
- A typo-only file exits 0 with warnings.
- A valid config exits 0 with an empty problems table.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: `config --verify` validates all config; problems table; severities and exit codes.
- `docs/architecture/package-structure.md` - update: `configcheck.ts` and the docs-axi `docsConfigProblems` export.

## Risks and open questions

- Schema must stay in sync with keys that code reads; a test should fail when a code-read key is missing from the schema.
- The user file path honors `XDG_CONFIG_HOME`; tests must isolate it.
