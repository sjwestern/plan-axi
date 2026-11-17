---
title: ADR refs resolve across configured repos
summary: Why plan ADR refs also resolve against ADRs in repos that set a docs key, with repo-qualified refs
status: proposed
---

# ADR refs resolve across configured repos

## Context

A plan repo that coordinates several code repos has no ADRs of its own while the plans it holds cite ADRs that live in the code repos. Refs resolved only against the plan repo, so check failed with ADR_REF_UNKNOWN until the ADRs were copied.

## Decision

A [repos.<name>] table may set docs, a docs dir relative to the repo. change-axi check and the commit-plan and finish guards resolve ADR-NNNN-slug refs against the plan repo ADRs plus those of every such repo, read from its configured main checkout. A ref may be qualified as repo:ADR-NNNN-slug to look only in that repo. An unqualified ref whose number and slug exist in more than one repo is ADR_REF_AMBIGUOUS and must be qualified. Each repo still numbers and guards its own ADRs. docs-axi leaves qualified refs alone. A source repo that cannot be read gives ADR_SOURCE_UNAVAILABLE and is skipped.

## Consequences

Plans can cite ADRs without copying them, and the plan repo needs no docs. Refs to an unreadable source repo fail as unknown refs. Numbers can repeat across repos, so slugs and qualification disambiguate. docs-axi check does not resolve source repo ADRs, so docs bodies cannot cite them. Moving ADRs into the plan repo later needs no plan changes except dropping qualifiers.
