# 04 - Skills ask for conventional commits

Owns: skills/plan-apply/SKILL.md, skills/plan-propose/SKILL.md, skills/plan-archive/SKILL.md
Docs: none

## Goal

Skills instruct agents to write conventional commits with a Change trailer.

## Context

plan-apply line 50 says `git commit -m "<slug>: <step summary>"`. Propose and plan amendments have no format. The separate commit skill matches repo style, so skills only state the convention. The tool adds the trailer itself for its own commits.

## Work

1. plan-apply: step commit `git commit -m "<type>(<area>): <summary>" -m "Change: <slug>" -- <paths>`; type from feat/fix/refactor/test/docs, area is the package or feature touched (e.g. docs-axi), not the slug. Plan amendments: `docs(plan): <why>` with the trailer.
2. plan-propose step 9: the skill does not commit. Tell the human to review the diff, then run `change-axi commit-plan` (the slug is auto-detected when only one plan is uncommitted; pass `<slug>` otherwise). plan-apply amendments: `change-axi commit-plan <slug> --reason "<why>"`.
3. plan-archive: reasons for --skip-docs-check go in the commit body.
Skills are edited under skills/<name>/SKILL.md in the repo.

## Done when

`rg "<slug>: " skills` finds no old format; each of the three skills shows the conventional format with the Change trailer.
