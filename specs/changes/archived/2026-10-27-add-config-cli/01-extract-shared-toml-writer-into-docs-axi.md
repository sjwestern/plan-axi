# 01 - Extract shared TOML writer into docs-axi lib

Owns: packages/docs-axi/src/configwrite.ts, packages/docs-axi/src/tomlwrite.ts, packages/docs-axi/test
Docs: docs/architecture/package-structure.md
Tier: standard

## Goal

Move the generic TOML upsert and validate-by-load code out of docs-axi configwrite.ts into an exported lib so change-axi can reuse it.

## Context

Tier standard: refactor across a package boundary with existing tests. Exposed via the docs-axi `./lib/*` export. docs-axi config behavior must not change. ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type.

## Work

1. Create packages/docs-axi/src/tomlwrite.ts exporting quote, upsertKey, removeKey, removeTable, and applyTomlEdit(path, edit, validate) that reads the file (ENOENT = empty), keeps CRLF, runs the edit on lines, calls validate(candidate), then writes.
2. Rewrite writeLayoutConfig in configwrite.ts to use them; keep pruneRemovedGuides and parseGuide there.
3. Add tests for upsert into new/existing tables, comment preservation, removal, CRLF.

## Done when

`npm test` passes with the existing docs-axi config tests unchanged and the new tomlwrite tests.
