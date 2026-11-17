---
title: docs-axi reads and checks docs across configured repos
summary: Why docs-axi gains --repo, --all-repos and cross-repo ADR ref checks, and why repo config moved into docs-axi
status: accepted
---

# docs-axi reads and checks docs across configured repos

## Context

A plan repo that holds no docs of its own needs to read and cite docs that live in code repos. change-axi resolved ADR refs across repos (ADR-0015-adr-refs-resolve-across-configured-repos), but docs-axi could not search, show or check against them, and the repo config and Windows path handling lived in change-axi.

## Decision

Repo config, host detection and path resolution live in docs-axi (repohost). Repos with a docs key are sources. docs-axi list, search, show, sections and adr list or search accept --repo <name>, and list, search and adr list or search accept --all-repos, which returns one result per repo. Writes never cross repos. docs-axi check resolves ADR refs, plain or repo-qualified, against the repo ADRs plus the source repo ADRs, and warns ADR_SOURCE_UNAVAILABLE for an unreadable source. Renumber and fix-refs stay per repo and skip qualified refs.

## Consequences

A plan repo can find and cite docs in code repos without copying them. docs-axi now depends on checkouts being present to resolve cross-repo refs, and warns when they are not. ADR-0015-adr-refs-resolve-across-configured-repos stated that docs-axi check did not resolve source repo ADRs; this decision replaces that limit.
