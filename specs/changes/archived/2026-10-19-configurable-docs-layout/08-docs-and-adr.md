# 08 - Docs and ADR

Owns: README.md, docs/README.md, docs/domain/cli-quick-reference.md, docs/architecture/package-structure.md, docs/decisions/0009-docs-layout-is-config-adr-section-stays-a-fixed-type.md
Docs: none

## Goal

Docs and an ADR describe the configurable layout.

## Context

ADR 2/3/6 constrain: docs edited in place, section-level CLI, config via `.plan-axi.toml`. ADR numbers are assigned by `docs-axi adr` (expected 0007; set the Owns path to the file it creates). Docs must not link to changes.

## Work

1. `README.md` Config section: `dir`, `sections`, `adr`, `[docs.section.*] guide`, `docs-axi config`, migrate follow-up; update the layout diagram line.
2. `docs/domain/cli-quick-reference.md`: `config`, `where`, `change:<slug>`.
3. `docs/architecture/package-structure.md`: where the layout is resolved and shared.
4. `docs-axi adr "Docs layout is config; ADR section stays a fixed type" --summary ...`; accept at archive.
5. `docs-axi index`.

## Done when

`docs-axi check` has no errors; README examples run as written; `change-axi check configurable-docs-layout` passes.
