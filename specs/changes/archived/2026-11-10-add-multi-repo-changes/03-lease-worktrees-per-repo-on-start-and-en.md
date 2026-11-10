# 03 - Lease worktrees per repo on start and enter

Owns: packages/change-axi/src/start.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/agent.ts
Docs: none
Tier: standard

## Goal

Lease one worktree per listed repo on start and enter.

## Context

Lease logic and treehouse parsing live in src/start.ts; enter launches the agent via src/agent.ts. Use the RepoRuntime from step 01 and the Repos header from step 02. Tier: standard.

## Work

- start/enter lease each listed repo on branch <slug> from its base (default branch when no @base); the plan repo is leased as before.
- Idempotent: reuse an existing worktree for the slug. If one lease fails, report what succeeded and leave leases in place.
- Output lists repo, branch, base and path (native and WSL forms) per repo. enter passes the extra paths into the launch context.
- Tests with a two-repo fixture and injected runtime.

## Done when

Two-repo start leases both and a rerun reuses them; single-repo output unchanged.
