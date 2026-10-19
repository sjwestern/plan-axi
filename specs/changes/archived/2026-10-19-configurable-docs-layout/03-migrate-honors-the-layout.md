# 03 - Migrate honors the layout

Owns: packages/docs-axi/src/commands/migrate.ts, packages/docs-axi/test/migrate.test.ts
Docs: none

## Goal

`docs-axi migrate` proposes and validates sections from the configured layout.

## Context

`suggestSection` in migrate.ts hard-codes domain/architecture/decisions and keyword regexes. Migration is the explicit way to move files into a changed layout (they appear as other/UNMANAGED). Plan entry `section` must be a configured section.

## Work

1. Validate plan `section` against the layout (not `isSection` constants); ADR handling (numbering, status accepted) applies to `layout.adr` only.
2. Suggest by: a configured section whose name matches a path segment; ADR-dir patterns to the ADR section when set; keep/ignore rules; the old architecture/domain keyword guesses only when those sections exist.
3. No match: `section: ""`, shown as needs a section; `--apply` refuses until set.
4. Help text lists the configured sections.

## Done when

`npm test` passes. Tests: default layout proposal unchanged; custom layout moves files into custom sections and renumbers ADRs into the ADR section; unmatched file blocks `--apply`; plan with an unknown section errors.
