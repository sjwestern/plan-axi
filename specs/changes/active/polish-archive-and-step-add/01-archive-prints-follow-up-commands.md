# 01 - Archive prints follow-up commands

Owns: packages/change-axi/src/archive.ts, packages/change-axi/test/archive.test.ts
Docs: none

## Goal

archive tells the agent the next commands after finishing on a branch.

## Context

Archive already detects branch vs main-after-merge (`mode` in archive.ts). Report object is returned for dry run and real run; add `next` only for branch mode. Base branch name is already computed.

## Work

1. In archive.ts add `next: string[]` to the report for branch mode: `from the main checkout: git merge --ff-only <slug>` and `treehouse return <toplevel>`.
2. Skip when mode is main.
3. Extend archive.test.ts for both modes.

## Done when

`npm test -w packages/change-axi` passes; branch-mode archive test asserts both next lines, main-mode asserts none.
