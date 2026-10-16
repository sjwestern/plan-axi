# 02 - Setup block carries the rule

Owns: packages/change-axi/src/setup.ts, packages/change-axi/test/setup.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

The setup block carries the rule and is refreshed in place on repos that already have it.

## Context

setup.ts: `SETUP_BLOCK` between `START_MARK`/`END_MARK`; `applySetup` returns `changed: false` whenever the markers exist (`hasBlock`), so an older block never updates. Keep line endings via `detectEol`/`applyEol`. `--remove` path must keep working.

## Work

1. Add a bullet to SETUP_BLOCK: `Put every command the user may copy in its own fenced code block on its own line; never at the end of a prose sentence.`
2. applySetup: when the markers exist, extract the current block, compare to SETUP_BLOCK (after EOL normalization) and replace it when different; return changed accordingly. Text outside the markers is untouched.
3. test/setup.test.ts: stale block replaced and reported changed; identical block unchanged; surrounding text and CRLF preserved; remove still works.

## Done when

`npm test -w packages/change-axi` passes including the new setup cases.
