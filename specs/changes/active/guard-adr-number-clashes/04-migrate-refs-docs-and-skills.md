# 04 - Migrate refs, docs and skills

Owns: docs/domain/cli-quick-reference.md, docs/domain/glossary.md, skills/plan-propose/SKILL.md, skills/plan-explore/SKILL.md, specs/changes/active/add-agent-profiles/*.md, specs/changes/active/add-run-wave/*.md, specs/changes/active/improve-docs-axi-adr-discovery/*.md
Docs: none

## Goal

Existing docs, plans and skills use the ADR-NNNN-slug form, and skills describe the rule.

## Context

ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. Bare refs in docs and active plans fail the new checks. Use change-axi write for plan edits.

## Work

1. Convert bare ADR refs in the three active plans listed in Owns and in docs prose to ADR-NNNN-slug.
2. cli-quick-reference: adr renumber, ref form, guard errors. glossary: ADR reference.
3. plan-propose and plan-explore: always cite ADRs in full form; on a clash error run the printed renumber command.

## Done when

docs-axi check and change-axi check pass for every active plan. rg 'ADR [0-9]' docs specs/changes/active finds no bare refs.
