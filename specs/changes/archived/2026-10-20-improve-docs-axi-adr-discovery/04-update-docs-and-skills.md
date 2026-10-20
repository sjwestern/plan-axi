# 04 - Update docs and skills

Owns: docs/domain/cli-quick-reference.md, skills/plan-propose/SKILL.md, skills/plan-explore/SKILL.md, skills/plan-archive/SKILL.md, packages/change-axi/src/commands.ts
Docs: docs/domain/cli-quick-reference.md

## Goal

Docs and skills use docs-axi adr add and mention adr list/search.

## Context

Skills run from skills/ in this repo (symlinked). plan-propose step 7 and plan-explore step 1 reference ADR commands.

## Work

Update cli-quick-reference.md (adr subcommands, search --all, dashboard home). plan-propose step 7: docs-axi adr add. plan-explore step 1: use docs-axi adr list/search to check ADRs. plan-archive step 2: docs-axi adr supersede <old> --by <new>; and the matching archive help line in commands.ts (line ~586). Quick reference: adr supersede replaces top-level supersede.

## Done when

rg 'docs-axi adr "' docs skills finds no old-form usage, and rg 'docs-axi supersede' docs skills packages finds none. docs-axi check passes.
