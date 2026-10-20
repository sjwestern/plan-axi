# 04 - Update docs and skills

Owns: docs/domain/cli-quick-reference.md, skills/plan-propose/SKILL.md, skills/plan-explore/SKILL.md
Docs: docs/domain/cli-quick-reference.md

## Goal

Docs and skills use docs-axi adr add and mention adr list/search.

## Context

Skills run from skills/ in this repo (symlinked). plan-propose step 7 and plan-explore step 1 reference ADR commands.

## Work

Update cli-quick-reference.md (adr subcommands, search --all, dashboard home). plan-propose step 7: docs-axi adr add. plan-explore step 1: use docs-axi adr list/search to check ADRs.

## Done when

rg 'docs-axi adr "' docs skills finds no old-form usage. docs-axi check passes.
