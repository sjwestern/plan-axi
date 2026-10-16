# 02 - Setup command for AGENTS.md

Owns: packages/change-axi/src/setup.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/setup.test.ts
Docs: none

## Goal

`change-axi setup` adds (and `--remove` removes) a managed block in AGENTS.md telling agents to use plan-apply Execute on a change branch.

## Context

Block is delimited by `<!-- plan-axi:start -->` / `<!-- plan-axi:end -->`. Target file: `--file`, else existing `AGENTS.md`, else existing `CLAUDE.md`, else create `AGENTS.md`. Never touch text outside the markers; preserve EOL. Export `hasSetupBlock(root)` for the hint added in step 03.

## Work

1. `src/setup.ts`: block text (short: on a branch matching `specs/changes/active/<slug>` use plan-apply Execute and run `change-axi` for status; use `change-axi`, never hand-edit tasks.md), `applySetup`, `removeSetup`, `hasSetupBlock`.
2. Command `setup [--file f] [--remove]` in `commands.ts`, registered in `cli.ts` with help and top-level help.
3. Tests: add to empty/missing/existing file, twice is a no-op, remove restores original bytes, CRLF kept.

## Done when

`npm test` passes. `change-axi setup` twice leaves exactly one block; `change-axi setup --remove` returns AGENTS.md to its original content.
