# 04 - Migrate refs, docs and skills

Owns: packages/change-axi/src/setup.ts, packages/change-axi/test/setup.test.ts, skills/plan-archive/SKILL.md, skills/plan-apply/SKILL.md, skills/plan-migrate-docs/SKILL.md, README.md, specs/changes/archived/*.md, docs/domain/cli-quick-reference.md, docs/domain/glossary.md, skills/plan-propose/SKILL.md, skills/plan-explore/SKILL.md, specs/changes/active/add-agent-profiles/*.md, specs/changes/active/add-run-wave/*.md, specs/changes/active/improve-docs-axi-adr-discovery/*.md
Docs: none

## Goal

Existing docs, plans and skills use the ADR-NNNN-slug form, and skills describe the rule.

## Context

Adr supersede lives under docs-axi adr (change:improve-docs-axi-adr-discovery); apply that change first. ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. Bare refs in docs and active plans fail the new checks. Use change-axi write for plan edits.

## Work

1. Run docs-axi adr fix-refs in this repo (docs, active and archived changes) and commit the result; hand-fix anything it lists as unresolved.
2. cli-quick-reference: adr renumber, adr fix-refs, ref form, guard errors. Add an upgrade note: existing repos must run docs-axi adr fix-refs once, because bare refs are now errors. glossary: ADR reference.
3. plan-propose and plan-explore: always cite ADRs in full form; on a clash error run the printed renumber command.
4. plan-archive: use full refs (docs-axi show <ref> --section Decision, docs-axi adr supersede <old> --by <new>); if archive or finish fails on an ADR clash or ref error, run the printed adr renumber or adr fix-refs command and retry. plan-apply docs steps: run docs-axi check, and adr fix-refs or adr renumber if it reports ref errors. plan-migrate-docs: finish with docs-axi adr fix-refs.
5. setup.ts AGENTS block: ADRs are cited as ADR-NNNN-slug, and an existing repo runs docs-axi adr fix-refs once. Update the setup test.

## Done when

docs-axi check and change-axi check pass for every active plan. rg 'ADR [0-9]' docs specs/changes/active finds no bare refs.
