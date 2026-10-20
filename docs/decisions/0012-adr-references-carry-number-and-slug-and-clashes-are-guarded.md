---
title: ADR references carry number and slug and clashes are guarded
summary: Why ADR refs use ADR-NNNN-slug, renumber rewrites them, and commit-plan and finish fail on duplicate numbers
status: proposed
---

# ADR references carry number and slug and clashes are guarded

## Context

Two checkouts can each take the next ADR number; git merges both files cleanly and docs-axi check only reports the duplicate if run. Bare refs like `ADR 7` cannot say which document is meant once two share a number, so fixing a clash means hand-editing prose.

## Decision

References use the full form ADR-NNNN-slug. docs-axi check and change-axi check reject bare and unresolved refs. docs-axi adr renumber renames the file and rewrites all refs in the docs dir, active plans and archived changes (changes may reference docs). The next free number is the max across the working tree, the local default branch and origin/<default>, plus 1, never filling gaps. commit-plan and finish fail on duplicate numbers, numbers already used on the default branch, or unresolved refs, with at most two commands to run: renumber, then retry. No network fetch. docs-axi adr fix-refs is the required migration: it rewrites bare and stale refs in docs, active changes and archived changes, and fails on ambiguous ones. There is no soft mode. Changes may reference docs; docs must not reference changes.

## Consequences

A clash is fixed with one command and exact-token replacement. Existing repos must run docs-axi adr fix-refs once before checks and guards pass; archived changes are rewritten too. A number held only on an unfetched remote or another feature branch is not visible; a pre-emptive renumber --to is allowed and the guard catches the clash when that ADR reaches the default branch. Plans carry longer reference strings.
