# 02 - Document the docs pointer

Owns: docs/architecture/plan-workflow.md
Docs: none

## Goal

plan-workflow.md mentions that the setup block also points agents at the docs index.

## Context

Depends on step 01 for the final wording. Only the "Launch and orientation" section changes.

## Work

Append one sentence to "Launch and orientation" via `docs-axi write architecture/plan-workflow.md --section "Launch and orientation" --add`: the block also tells agents to start at the docs index (`docs-axi`, then `search` and `show`, `rg docs/` as fallback) for doc lookup, exploration and planning. Run `docs-axi index` if summaries changed.

## Done when

`docs-axi check` passes and `docs-axi show architecture/plan-workflow.md --section "Launch and orientation"` includes the sentence.
