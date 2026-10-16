---
title: Agent launch uses a command template
summary: Why enter runs a configurable command template instead of per-agent adapters
status: proposed
tags: [workflow]
---

# Agent launch uses a command template

## Context

Users run different agent CLIs; starting one in the right worktree with the right prompt is repetitive.

## Decision

change-axi enter spawns the configured command template (config, env, then a small PATH autodetect table) in the worktree with prompt 'apply <slug> [step]'. No per-agent code beyond the table. The agent is spawned directly, not via treehouse enter.

## Consequences

Portable across agents. Table entries can be wrong and are overridable. Direct spawn skips user shell hooks.
