# 03 - Document backlog conventions

Owns: skills/plan-explore/SKILL.md, skills/plan-propose/SKILL.md, skills/plan-apply/SKILL.md, packages/change-axi/src/setup.ts, docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, docs/domain/glossary.md
Docs: none

## Goal

Skills, setup block and docs describe the backlog flow and conventions, and an ADR records the decision.

## Context

Behavior from steps 1 and 2: `idea`, `backlog`, `new [--from]`, `start` refusal, priority P0-P4, kinds idea|bug|chore. The ADR is scaffolded at propose time; this step makes sure it is accurate and moves it to accepted at archive (plan-archive does that). Conventions: Ready = explore produced a draft with scope and acceptance criteria; deprioritized = stays queued with a lower priority; decided not to do = accepted ADR "Do not X", `tasks-axi rm` the item, delete any plan folder.

## Work

1. `plan-explore`: accept a backlog item as input; read it with `tasks-axi show <slug> --full`; mention `change-axi backlog`; check rejected-idea ADRs through `docs-axi adr search`.
2. `plan-propose`: step 2 resolves the slug against unplanned items first; step 3 adopts with `change-axi new <slug>` or `--from`; add the do-not-do and deprioritize guidance.
3. `plan-apply`: pick from changes only; unplanned items need propose first.
4. `src/setup.ts` block: one line on capturing with `change-axi idea` and listing with `change-axi backlog`.
5. Docs: quick reference (commands), plan-workflow (lifecycle and conventions), glossary (idea, bug, chore, unplanned item, Ready). Use `docs-axi write <doc> --section ...`.

## Done when

`docs-axi check` and `change-axi check add-backlog-ideas` pass. `rg -n "change-axi idea" skills docs packages/change-axi/src/setup.ts` shows each file above. `npm test` passes.
