# 02 - Repos header and Owns check

Owns: packages/change-axi/src/spec.ts, packages/change-axi/src/check.ts, packages/change-axi/src/change.ts
Docs: none
Tier: standard

## Goal

Parse the proposal Repos header and validate Owns prefixes.

## Context

Header lines are parsed in src/change.ts; checks live in src/check.ts; the required-section spec is in src/spec.ts. Tier: standard.

## Work

- Parse `Repos: name@base, name` in the proposal header; expose a repo list with optional base.
- `change-axi check`: error when an Owns `<repo>:` prefix is not listed, or a listed repo is not in config.
- `change-axi spec proposal` documents the Repos header.

## Done when

Check tests cover missing prefix, unknown repo and no Repos header; existing plans still pass.
