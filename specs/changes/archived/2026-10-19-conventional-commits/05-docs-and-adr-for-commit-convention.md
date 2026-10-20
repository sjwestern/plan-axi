# 05 - Docs and ADR for commit convention

Owns: docs/architecture/plan-workflow.md, docs/domain/cli-quick-reference.md, CONTRIBUTING.md, README.md, docs/decisions/0010-commits-are-conventional-with-a-change-trailer.md
Docs: docs/decisions/0010-commits-are-conventional-with-a-change-trailer.md

## Goal

Docs describe the commit convention, the tool commit format and the lint/changelog setup; the ADR is final.

## Context

ADR-0010-commits-are-conventional-with-a-change-trailer is scaffolded (proposed) by plan-propose; plan-archive accepts it. Docs must not reference the change. Steps 01-04 define the final behavior.

## Work

1. plan-workflow.md: add the commit format table (tool commits vs agent commits) and the hook-failure behavior.
2. cli-quick-reference.md: tool commit subjects, trailer, and the `[commit] type|plan_type|scope|trailer` settings and the `commit-plan` command with defaults, next to the `[apply]` example.
3. README.md: one line in the config section (line ~28) pointing at `[commit]`.
4. CONTRIBUTING.md: conventional commits enforced by husky; `npm install` installs the hook; `npm run changelog`.
5. Review ADR-0010-commits-are-conventional-with-a-change-trailer against what was built; adjust text only.

## Done when

`docs-axi check` passes; each doc above mentions the format and the trailer.
