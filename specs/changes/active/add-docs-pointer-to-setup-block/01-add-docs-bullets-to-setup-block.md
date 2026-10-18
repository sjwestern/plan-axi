# 01 - Add docs bullets to setup block

Owns: packages/change-axi/src/setup.ts, packages/change-axi/test/setup.test.ts, AGENTS.md
Docs: architecture/plan-workflow.md

## Goal

`change-axi setup` writes a block with a docs-finding bullet and an exploration/planning bullet.

## Context

`SETUP_BLOCK` in `setup.ts` is compared byte-for-byte by `applySetup`, so an old block is refreshed in place. ADR 3: agents read docs by section through the CLI. Keep the existing three bullets unchanged.

## Work

1. In `packages/change-axi/src/setup.ts` add two bullets to `SETUP_BLOCK` after the existing ones:
   - `To find docs, start at the index: run \`docs-axi\` (lists docs/README.md), then \`docs-axi search <terms>\` for a topic and \`docs-axi show <path> --section <name>\` to read only what you need. If \`docs-axi\` is unavailable, use \`rg <terms> docs/\` (it covers the index and doc bodies) and read only the matching files. Don't \`rg\` just the index when \`docs-axi\` works, since it lists only titles and summaries.`
   - `For exploration and planning tasks, look at the docs first (see above) so the idea fits existing docs and ADRs.`
2. In `packages/change-axi/test/setup.test.ts` add a test asserting `SETUP_BLOCK` contains `docs-axi search`, `rg <terms> docs/`, and the exploration/planning bullet. Existing stale-block refresh test must still pass.
3. Run `change-axi setup` at the repo root to refresh the block in AGENTS.md (use the worktree build: `node packages/change-axi/dist/bin/change-axi.js setup`).

## Done when

- `npm test` passes, including the new test.
- AGENTS.md block shows both new bullets and a second `setup` run reports no change.
