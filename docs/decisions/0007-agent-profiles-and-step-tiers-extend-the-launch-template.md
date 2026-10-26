---
title: Agent profiles and step tiers extend the launch template
summary: Why agent launch gains harness/model/effort profiles and per-step tiers
status: accepted
---

# Agent profiles and step tiers extend the launch template

## Context

ADR-0006-agent-launch-uses-a-command-template launches one command template for every step. Controllers want a smaller model for small or parallel steps without retyping commands, and plans must stay portable across machines.

## Decision

Config defines profiles (`[apply.agents.<name>]`: harness, model, effort, or a `command` template) and a tier-to-profile map (`[apply.tiers]`). Steps carry an optional, editable `Tier:` header (`small`, `standard`, `deep`). plan-propose suggests tiers from plain-language rules in `[propose.tiers]` (read via `change-axi guidance`). Launch resolution is deterministic: `enter --agent`, step tier, `[apply] agent`, env, autodetect. The command template remains the escape hatch. Pi is the first adapter.

Alternatives rejected: raw model names in plans (not portable across machines and providers); natural-language rules evaluated at launch (non-deterministic, not reviewable).

## Consequences

Plans name tiers, not models. Judgment happens once at proposal time and is reviewable. Each new harness needs a small adapter for model and effort flags.
