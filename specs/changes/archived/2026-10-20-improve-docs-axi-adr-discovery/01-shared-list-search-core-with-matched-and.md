# 01 - Shared list/search core with matched and --all

Owns: packages/docs-axi/src/commands/read.ts, packages/docs-axi/test/search.test.ts
Docs: none

## Goal

list and search share one core with pluggable row formatters. search gains matched N/M and --all; mixed results mark ADRs.

## Context

ADR 0011, 0009. Core lives in read.ts. Later steps call the core with the ADR section and their own formatter. Unknown flags must error (args.ts parseArgs).

## Work

1. Extract listDocs(ctx, {section, tag, status}) and searchDocs(ctx, terms, {section, all}) returning scored docs with matched count.
2. Add --all to search: keep only docs where matched equals term count.
3. Add a matched column (N/M) to search rows.
4. Mark ADR rows in generic list/search output (kind or ADR-NNNN in status column; - for other docs).
5. Keep list --status working (generic list only).

## Done when

npm test passes with new test/search.test.ts covering: matched column, --all excludes partial matches, ADR marker in mixed results, unknown flag error, 0-match message. docs-axi search worktree launch --all shows only docs containing both.
