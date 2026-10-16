# 01 - Skills call binaries directly

Owns: skills/plan-explore/SKILL.md, skills/plan-propose/SKILL.md, skills/plan-apply/SKILL.md, skills/plan-archive/SKILL.md, skills/plan-migrate-docs/SKILL.md
Docs: docs/architecture/plan-workflow.md

## Goal

No skill recommends npx for change-axi or docs-axi, and plan-apply makes the agent bootstrap a fresh worktree first.

## Context

Current fallbacks are `npx -y change-axi@0.1.0` / `docs-axi@0.1.0` / `tasks-axi@0.2.6` in all five skills. Packages are unpublished. Bootstrap command is repo-specific, so apply says "follow the repo's bootstrap instructions (AGENTS.md, CONTRIBUTING)".

## Work

1. In each skill replace the npx fallbacks for change-axi/docs-axi with: call the binary on PATH; on "command not found" stop and tell the user to install it.
2. Keep `npx -y tasks-axi@0.2.6` only as a fallback after "command not found".
3. plan-apply: add a first step in the worktree flow: if `node_modules`/build output is missing, run the bootstrap from AGENTS.md or CONTRIBUTING before implementing.
4. plan-apply: when the step touches CLI code, smoke-test with the repo's in-worktree form (named in AGENTS.md), not the global binary.

## Done when

`grep -rn 'npx' skills/` lists only tasks-axi fallbacks; `grep -n -i bootstrap skills/plan-apply/SKILL.md` matches.
