---
title: ADRs are read through the adr subcommand
summary: Why ADR list, search and add live under docs-axi adr and status filtering is ADR-only
status: accepted
---

# ADRs are read through the adr subcommand

## Context

Agents checking work against decisions must know the ADR section name, and mixed search output only implies which rows are ADRs. A status filter on generic search would exclude every doc without status.

## Decision

docs-axi adr has list, search and add subcommands that wrap the shared list/search core scoped to the ADR section resolved from the layout. Status filtering exists only in adr list. Generic list and search mark ADR rows explicitly. Bare adr prints counts and hints.

## Consequences

Agents discover ADR access from bare docs-axi and docs-axi adr. One search implementation. The old docs-axi adr "<title>" form becomes docs-axi adr add and the old form errors with a hint; skills and docs are updated.
