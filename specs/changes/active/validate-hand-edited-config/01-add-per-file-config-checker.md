# 01 - Add per-file config checker

Owns: packages/change-axi/src/configcheck.ts, packages/change-axi/src/configcheck.test.ts, packages/change-axi/src/planconfig.ts
Docs: none

## Goal

A pure checker that validates one parsed config file and the merged view, returning located problems.

## Context

Replaces `planConfigProblems` in `planconfig.ts`; keep `validatePlanConfig` working for `config` writes. Problem shape: `{file, key, severity: "error"|"warning", message}`. Step 03 consumes it; step 02 supplies docs problems separately. Read-side rules already in `commitstyle.ts` (WORD/TOKEN regexes) and `guidance.ts`: reuse, do not copy.

## Work

1. Create `configcheck.ts` with a schema of known keys: `apply.agent`, `apply.agents.<n>.{harness,model,effort,command}`, `apply.tiers.<tier>`, `propose.default_tier`, `propose.tiers.<tier>`, `commit.{type,scope,plan_type,trailer}`, `repos.<n>.{path,platform,git,treehouse}`, and the docs keys (`docs.dir`, `docs.sections`, `docs.adr`, `docs.ignore`, `docs.map.*`, `docs.section.<n>.guide`) as known-only (values checked by step 02).
2. `checkFile(path, raw)`: types, `[commit]` regexes, tier names, `propose.tiers` string or string array, repo keys/platform/path, profile needs harness or command, unknown keys as warnings with a did-you-mean (edit distance <= 2) hint.
3. Templates: `apply.agent` and profile `command` must contain `{prompt}` (error); unknown `{x}` placeholders warn; harness profiles exempt.
4. `checkMerged(files)`: tier maps to a profile defined in either file; repo `path` present across files. Problems name the file holding the offending key.
5. Syntax errors from `parseToml` become an error problem with the file.
6. Point `validatePlanConfig` at the new checker (errors only).
7. Tests per rule, plus a user+repo cross-file case and a test that every key read via `loadRawConfig` in the code is in the schema.

## Done when

`npm test -w packages/change-axi` passes with the new tests; `config` writes still reject the same structural errors as before.
