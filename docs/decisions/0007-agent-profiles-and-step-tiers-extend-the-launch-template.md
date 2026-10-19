---
title: Agent profiles and step tiers extend the launch template
summary: Why agent launch gains harness/model/effort profiles and per-step tiers
status: proposed
---

# Agent profiles and step tiers extend the launch template

## Context

ADR 6 launches one command template for every step. Controllers want a smaller model for small or parallel steps without retyping commands, and plans must stay portable across machines.

## Decision

Config defines profiles (harness, model, effort) and a tier-to-profile map. Steps carry an editable Tier. plan-propose suggests tiers from user guidance in config; resolution at launch is deterministic. The command template remains the escape hatch. Pi is the first adapter.

## Consequences

Plans name tiers, not models. Judgment happens once at proposal time and is reviewable. Each new harness needs a small adapter for model and effort flags.
