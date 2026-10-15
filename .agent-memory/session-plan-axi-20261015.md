# Session notes 2026-10-15 (temporary)

- Design discussion covered: repo placement (own repo plan-axi), flow differences from OpenSpec (no delta merge, no checkbox tasks, tasks-axi for tasks/deps, docs/ edited directly), per-change tasks.md via `--file`, repo backlog.md per-change entry, treehouse worktree per feature, parallel agents in one worktree (herdr panes) with Owns overlap checks.
- Realistic assessment given to user: skills + templates first, CLI only where agents slip; docs-axi and `check` are the highest-value deterministic pieces.
- Built: docs-axi, skills, check-plan.mjs. Waiting on user for a real test repo.
- Env: node v24, npm 11, tasks-axi 0.2.6 and treehouse installed globally; `axi-sdk-js` index does NOT export output types (docs-axi defines its own in src/types.ts).
