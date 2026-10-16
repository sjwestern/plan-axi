---
title: Plans are committed on main, steps run in a worktree
summary: Why plan approval is the main-branch commit and implementation happens in a treehouse worktree
status: accepted
---

# Plans are committed on main, steps run in a worktree

## Context

A plan needs a human review gate, and parallel features or steps must not trample each other.

## Decision

Propose writes the plan without committing. The human reviews the diff and commits on main; that commit is the approval, and apply refuses to start without it. Apply marks the change in flight on main, then leases a treehouse worktree and branch named after the slug. Steps run there, one commit per step, committing only their own paths. Archive runs on the branch (preferred) or on main after merge.

## Consequences

- Parallel features use separate worktrees.
- Parallel steps share a worktree and rely on `Owns:` overlap checks.
- No separate review-gate task is needed.
