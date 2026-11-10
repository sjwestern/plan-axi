# 05 - Finish across repos

Owns: packages/change-axi/src/finish.ts, packages/change-axi/src/commands.ts
Docs: none

## Goal

Finish merges every repo in the change, plan repo last.

## Context

Current finish is src/finish.ts (plan repo only). Proposal Approach describes preflight-then-merge and a re-runnable partial failure. Tier: deep, git-state sensitive.

## Work

- Preflight every repo: clean worktree, branch exists, ff-able onto its base. --dry-run prints a table (repo, base, ahead/behind, ready or rebase needed with the exact rebase command via that repo git).
- Refuse to start any merge while any repo needs a rebase or is dirty.
- ff-merge each external repo into its base, return its lease, delete the branch; then archive and finish the plan repo as today.
- Re-run skips repos already merged; on failure report merged and pending repos.
- Never use WSL git on a windows-platform repo.
- Tests with a multi-repo fixture covering rebase-needed, partial failure and re-run.

## Done when

Dry-run and real finish behave as the Acceptance section describes; single-repo finish unchanged.
