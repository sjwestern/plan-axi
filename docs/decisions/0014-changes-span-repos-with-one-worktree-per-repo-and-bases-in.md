---
title: Changes span repos with one worktree per repo and bases in the plan
summary: Why a change leases a worktree per repo on the slug branch, with base branches in the proposal and an explicit platform flag per repo
status: proposed
---

# Changes span repos with one worktree per repo and bases in the plan

## Context

A change can edit several repos, including a Windows checkout reached from WSL. Only the plan repo had a managed worktree, so other repos were handled by hand and unchecked.

## Decision

Each repo listed in the proposal Repos header gets one treehouse worktree on branch <slug>. Base branches live in the plan, not config, because they vary per change. Config has a per-repo platform flag (wsl or windows) because path detection cannot tell a Windows checkout from a WSL clone; the flag only matters under WSL. Finish preflights all repos, ff-merges externals, then the plan repo last.

## Consequences

Repo config and a Repos header to maintain. Windows repos need Windows git and treehouse via interop. A partial finish is possible and is reported and re-runnable. Native Windows is unverified.
