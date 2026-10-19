# 07 - Skills and setup read the layout from the CLI

Owns: skills/plan-explore/SKILL.md, skills/plan-propose/SKILL.md, skills/plan-apply/SKILL.md, skills/plan-archive/SKILL.md, skills/plan-migrate-docs/SKILL.md, packages/change-axi/src/setup.ts, packages/change-axi/test/no-hardcoded-layout.test.ts
Docs: none

## Goal

Skills and the AGENTS.md setup block get the docs layout from `docs-axi config` and never hard-code folders.

## Context

Skills touching docs: plan-explore (read first), plan-propose (step 7 section picker, rules line about docs/{domain,...}), plan-migrate-docs (description, preflight, section bullet), plan-apply and plan-archive (Docs impact/ADR wording). The earlier hard-coded wording added to plan-propose step 7 must go. `setup.ts` is the generated AGENTS.md block. Skills are edited under `skills/` in this repo only.

## Work

1. Each skill: where it needs layout, say to run `docs-axi config` and pick the section by its guide; remove folder names and section meanings.
2. plan-migrate-docs: new first step: set the layout with `docs-axi config` (ask the user), then migrate; description no longer names the three folders.
3. plan-propose/plan-explore: related changes are referenced as `change:<slug>`, resolved with `change-axi where <slug>`. Docs and ADRs stand alone and never reference changes: put what the reader needs in the doc, not a pointer to the change.
4. `setup.ts`: block says to run `docs-axi config` for where docs go.
5. Test `no-hardcoded-layout.test.ts`: fails if any `skills/*/SKILL.md` or `setup.ts` contains `docs/domain`, `docs/architecture` or `docs/decisions`.

## Done when

`npm test` passes including the new test; `rg 'docs/(domain|architecture|decisions)' skills packages/change-axi/src/setup.ts` finds nothing; `change-axi setup` output mentions `docs-axi config`.
