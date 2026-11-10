# 03 - Wire checks into config verify

Owns: packages/change-axi/src/configcmd.ts, packages/change-axi/src/configcmd.test.ts
Docs: none

## Goal

`change-axi config --verify` validates all config and prints a located problems table before the profile rows.

## Context

Uses step 01 (`checkFile`, `checkMerged`) and step 02 (`docsConfigProblems`). Today `verifyRows` in `configcmd.ts` only calls `verifyProfiles`. Errors set exit 1; warnings do not. A missing binary stays `skipped`. Tests must set `XDG_CONFIG_HOME` to a temp dir.

## Work

1. In `verifyRows`, read the user file and repo file separately (user path via `userConfigPath`), run `checkFile` on each, `checkMerged`, and `docsConfigProblems`.
2. Output `problems[n]{file,key,severity,message}` first, then the existing `verify` rows. Empty problems prints `problems: none`.
3. Skip live profile checks for a profile only if its config is unparseable; `--profile <n>` still runs all config validation and limits only live checks. Unknown `--profile` keeps its VALIDATION_ERROR.
4. Exit 1 on any error problem or invalid profile.
5. `config` writes use the step 01 checker (already via `validatePlanConfig`); confirm no duplicate rules remain.
6. Tests: typo key (warning, exit 0), bad tier + bad commit type (exit 1, correct file), missing `{prompt}`, user+repo split, syntax error, valid config.

## Done when

`npm test` passes. `node packages/change-axi/dist/bin/change-axi.js config --verify` on a hand-edited bad repo file lists each problem with the right file and exits 1.
