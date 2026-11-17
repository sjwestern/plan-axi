# 03 - Document cross-repo ADR refs and record the decision

Owns: docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, docs/decisions/0015-adr-refs-resolve-across-configured-repos.md, docs/README.md
Docs: none

## Goal

Docs describe cross-repo ADR resolution, and the decision is recorded as an ADR.

## Context

Use docs-axi adr add for the ADR; never pick the number by hand. Cite ADRs as ADR-NNNN-slug. Docs never reference changes.

## Work

1. docs-axi adr add "ADR refs resolve across configured repos" with context, decision and consequences (source repos, qualified form, per-repo numbering stays). 2. Update docs/domain/cli-quick-reference.md with the docs key and qualified ref. 3. Update docs/architecture/plan-workflow.md where multi-repo plans resolve ADRs.

## Done when

docs-axi check and change-axi check pass; the new ADR is listed by docs-axi adr list.
