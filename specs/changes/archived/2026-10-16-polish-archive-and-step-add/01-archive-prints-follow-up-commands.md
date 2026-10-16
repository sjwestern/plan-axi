# 01 - Archive prints follow-up commands

Owns: packages/change-axi/src/archive.ts, packages/change-axi/test/archive.test.ts
Docs: none

## Goal

archive points the agent at `change-axi finish` after finishing on a branch.

## Context

Archive already detects branch vs main-after-merge (`mode` in archive.ts). Report object is returned for dry run and real run; add `next` only for branch mode. Base branch name is already computed.

## Work

1. In archive.ts add `next: string[]` to the report in branch mode with one line: `from the main checkout: change-axi finish <slug>`.
2. Skip when mode is main.
3. Extend archive.test.ts for both modes.

## Done when

`npm test -w packages/change-axi` passes; branch-mode archive test asserts the finish line, main-mode asserts none.
