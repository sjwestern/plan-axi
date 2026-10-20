# 02 - ADR renumber command

Owns: packages/docs-axi/src/commands/adrrenumber.ts, packages/docs-axi/src/cli.ts, packages/docs-axi/test/adrrenumber.test.ts
Docs: none

## Goal

docs-axi adr renumber moves an ADR to a new number and fixes every reference, in one command.

## Context

ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. Needs the adr router from change:improve-docs-axi-adr-discovery. The slug in each ref disambiguates a clashing pair. Archived changes are rewritten too (changes may reference docs); archived refs must stay valid.

## Work

1. commands/adrrenumber.ts: adr renumber <ref|path> [--to <n>]. Default number = max(working tree, local default branch tree, origin/<default> tree via git ls-tree, no fetch) + 1. Gaps are not filled. --to is rejected if taken in any of those; otherwise allowed (pre-emptive renumber).
2. Rename the file, update frontmatter/number fields, replace the exact ADR-NNNN-slug token in the docs dir, specs/changes/active and specs/changes/archived, regenerate the index.
3. Output: old and new ref, files changed count, help to run docs-axi check.
4. Idempotent: if already renumbered, say no-op, exit 0.
5. Wire into cli.ts and help.

## Done when

test/adrrenumber.test.ts passes: two ADRs numbered 12, renumber one, refs to each still resolve including in archived changes; number already on the default branch is skipped; origin/<default> number is skipped; --to taken errors; --to free number on an unfetched remote is allowed; rerun is a no-op. npm test passes.
