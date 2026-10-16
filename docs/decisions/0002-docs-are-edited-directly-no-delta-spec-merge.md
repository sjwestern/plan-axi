---
title: Docs are edited directly, no delta-spec merge
summary: Why docs/ is changed in place and archived changes are history only
status: accepted
---

# Docs are edited directly, no delta-spec merge

## Context

OpenSpec-style workflows merge delta specs into a canonical spec at archive time. That adds a merge step that can disagree with the code.

## Decision

Docs in `docs/` are edited directly as part of a change. Each proposal has a Docs impact section naming every doc it touches. Archived changes are history only; current truth is `docs/`.

## Consequences

- Archive checks that every doc in Docs impact was touched.
- No merge tooling to build or trust.
- Docs and code change in the same commits and review.
