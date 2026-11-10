# 04 - Update docs

Owns: docs/domain/cli-quick-reference.md, docs/architecture/package-structure.md
Docs: docs/domain/cli-quick-reference.md

## Goal

Docs describe the new `config --verify` behavior and code layout.

## Context

ADRs are not edited. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template says config is set via commands; the quick reference states that `--verify` is how to check hand edits.

## Work

1. `docs/domain/cli-quick-reference.md`: update the `config --verify` lines (line ~50 and ~130): validates all config, problems table, severities, exit codes, `--profile` scope.
2. `docs/architecture/package-structure.md`: mention `configcheck.ts` and the docs-axi `docsConfigProblems` export.
3. Run `docs-axi check`.

## Done when

`docs-axi check` passes.
