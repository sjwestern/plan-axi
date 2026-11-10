# 06 - Docs and skills

Owns: docs/architecture/plan-workflow.md, docs/domain/cli-quick-reference.md, skills/plan-apply/SKILL.md, skills/plan-propose/SKILL.md
Docs: decisions/0014-changes-span-repos-with-one-worktree-per-repo-and-bases-in.md

## Goal

Document the multi-repo flow.

## Context

Docs impact in the proposal lists the files. ADR-0014-changes-span-repos-with-one-worktree-per-repo-and-bases-in is already created; move it to accepted at archive. Tier: small.

## Work

- Update docs/architecture/plan-workflow.md and docs/domain/cli-quick-reference.md.
- Add a multi-repo section to skills/plan-apply/SKILL.md (Repos header, Owns prefix, finish order, dry-run) and a Repos header note to skills/plan-propose/SKILL.md.
- Run docs-axi check.

## Done when

docs-axi check passes; skills describe the flow without naming any private repo.
