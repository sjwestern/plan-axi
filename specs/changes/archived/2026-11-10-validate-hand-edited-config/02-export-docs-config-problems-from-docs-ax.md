# 02 - Export docs config problems from docs-axi

Owns: packages/docs-axi/src/config.ts, packages/docs-axi/src/config.test.ts
Docs: none

## Goal

docs-axi exposes `[docs]` layout validation as problems with file locations instead of throwing on the first error.

## Context

Today `loadConfig`/`resolveLayout` in `packages/docs-axi/src/config.ts` throw `bad(file, msg)` and track `origin` per key. Behavior of `loadConfig` must not change. change-axi imports it as `docs-axi/lib/config`. ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type governs the layout rules.

## Work

1. Add `docsConfigProblems(root)` returning `{file, key, message}[]` for all `[docs]` problems (collect, do not stop at the first), including `docs.ignore`/`docs.map.*` not being arrays and each user/repo file separately.
2. Refactor `resolveLayout` so `loadConfig` and `docsConfigProblems` share the rules; `loadConfig` still throws the first error as before.
3. Tests: one per existing rule, two problems at once, a bad key in the user file vs the repo file.

## Done when

`npm test -w packages/docs-axi` passes; existing docs-axi tests unchanged and green.
