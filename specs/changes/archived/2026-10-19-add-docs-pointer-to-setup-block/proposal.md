# Point agents at the docs index in the setup block

## Why

The managed plan-axi block in AGENTS.md covers apply mode and status questions only. During exploration and planning, and when looking up docs generally, agents get no pointer to the docs index, so they guess, skim files, or grep only the index and miss body matches.

## Context

Docs read: `architecture/plan-workflow.md` (Launch and orientation describes the setup block), `domain/cli-quick-reference.md`. ADR 3 applies (agents read docs by section through the CLI). Code: `packages/change-axi/src/setup.ts` (`SETUP_BLOCK`), `packages/change-axi/test/setup.test.ts`. No other ADR constrains this.

## What changes

- `SETUP_BLOCK` gains two bullets:
  1. Finding docs: start at the index with `docs-axi`, then `docs-axi search <terms>` and `docs-axi show <path> --section <name>`. If `docs-axi` is unavailable, use `rg <terms> docs/` (covers index and bodies). Do not `rg` just the index when `docs-axi` works, since it lists only titles and summaries.
  2. Exploration and planning tasks: look at the docs first (see above) so the idea fits existing docs and ADRs.
- This repo's own AGENTS.md block is refreshed with `change-axi setup`.
- Repos with the old block pick up the change by re-running `change-axi setup` (existing in-place refresh).

## Out of scope

- Changing the existing apply, status, or tasks bullets.
- Configurable docs paths.
- Auto-editing AGENTS.md in other repos.
- Changes to docs-axi search.

## Approach

Edit the `SETUP_BLOCK` constant and extend `setup.test.ts` to assert the new bullets and that a stale block is refreshed in place. Run `change-axi setup` in this repo to refresh AGENTS.md. Alternative considered: a separate `## docs` subsection in the block - rejected, two bullets are enough. Alternative: tell agents to read `docs/README.md` directly - rejected, ADR 3 and `docs-axi search` cover bodies and scale better. No new ADR.

## Steps

- `01-add-docs-bullets-to-setup-block.md` - Add the two bullets to `SETUP_BLOCK`, test them, refresh this repo's AGENTS.md.
- `02-document-the-docs-pointer.md` - Note the docs pointer in plan-workflow.md.

## Acceptance

- `npm test` passes, including a test that `SETUP_BLOCK` mentions `docs-axi search`, `rg` fallback, and exploration/planning.
- `change-axi setup` on a repo with the old block reports the block refreshed; running it again reports no change.
- This repo's AGENTS.md block shows both new bullets.
- `docs-axi check` passes.

## Docs impact

`docs/architecture/plan-workflow.md` - update: Launch and orientation notes the block also points agents at the docs index.

## Risks and open questions

- Block grows from three to five bullets; wording kept short to limit AGENTS.md noise.
