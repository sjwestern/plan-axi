---
title: docs-axi reads and checks docs across configured repos
summary: Why docs-axi gains --repo, --all-repos and cross-repo ADR ref and doc link checks, and why repo config moved into docs-axi
status: accepted
---

# docs-axi reads and checks docs across configured repos

## Context

A plan repo that holds no docs of its own needs to read and cite docs that live in code repos. change-axi resolved ADR refs across repos (ADR-0015-adr-refs-resolve-across-configured-repos), but docs-axi could not search, show or check against them, and the repo config and Windows path handling lived in change-axi.

## Decision

Repo config, host detection and path resolution live in docs-axi (repohost). Repos with a docs key are sources. docs-axi list, search, show, sections and adr list or search accept --repo <name>, and list, search and adr list or search accept --all-repos, which returns one result per repo. Writes never cross repos. docs-axi check resolves ADR refs, plain or repo-qualified, against the repo ADRs plus the source repo ADRs, and warns ADR_SOURCE_UNAVAILABLE for an unreadable source. Renumber and fix-refs stay per repo and skip qualified refs.

Doc links are checked across repos too. A markdown link whose target is `<repo>:<docs-path>[#anchor]`, where `<repo>` is a source repo, is a repo-qualified doc link. The path is relative to that repo docs dir, the same path `docs-axi list --repo <repo>` prints. docs-axi check reports BROKEN_LINK when the doc is missing there, and warns DOC_SOURCE_UNAVAILABLE for an unreadable source, which is skipped. Targets with any other scheme (https:, mailto:) are still ignored. Relative filesystem links between checkouts stay unsupported. Anchors are not checked.

## Consequences

A plan repo can find and cite docs in code repos without copying them, and a cited doc that is renamed or removed fails check instead of going stale. Agents link with `[text](repo:path.md)` instead of rewriting paths as prose. docs-axi now depends on checkouts being present to resolve cross-repo refs and links, and warns when they are not. ADR-0015-adr-refs-resolve-across-configured-repos stated that docs-axi check did not resolve source repo ADRs; this decision replaces that limit.
