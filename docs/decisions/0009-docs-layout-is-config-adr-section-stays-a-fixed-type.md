---
title: Docs layout is config; ADR section stays a fixed type
summary: Why docs folder and sections are configurable while the ADR section keeps fixed numbering and status rules
status: proposed
---

# Docs layout is config; ADR section stays a fixed type

## Context

Repos have their own docs folders and categories. Hard-coding docs/{domain,architecture,decisions} forced migrations and leaked into skills and tools.

## Decision

The docs dir, ordered sections, per-section guides and which section holds ADRs come from .plan-axi.toml, shown by docs-axi config. Defaults are unchanged. The ADR section keeps its numbering, status and supersession rules. Skills and tools read the layout from config and never name folders.

## Consequences

Existing repos work unchanged. Changing the layout needs docs-axi migrate for existing files. Tools share one resolved layout. Skills stay generic.
