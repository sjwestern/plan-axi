# 05 - change-axi uses the resolved layout

Owns: packages/change-axi/src/archive.ts, packages/change-axi/src/start.ts, packages/change-axi/src/spec.ts, packages/change-axi/test/archive.test.ts, packages/change-axi/test/start.test.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/change.ts
Docs: none

## Goal

change-axi uses the resolved docs dir and ADR section, fixing hard-coded paths in archive and start.

## Context

Gap: `archive.ts` detects ADRs with `/^docs\/decisions\/\d{4}-.+\.md$/`, builds its index context with `resolve(root, "docs")` ignoring `--docs`, and stages/checks literal `docs`; `start.ts` dirty-checks literal `docs`; `spec.ts` Docs impact guide cites `docs/domain/x.md`.

## Work

1. Load the layout once (via `docs-axi/lib/config`) and pass it on the change-axi context.
2. `archive.ts`: ADR detection uses `<dir>/<layout.adr>/NNNN-slug.md` (none when no ADR section); index context and staging use `layout.dir`; dirty checks use it.
3. `start.ts`: dirty check uses `layout.dir`.
4. `spec.ts`: Docs impact guide text generated from the layout (`<dir>/<section>/x.md`).

## Done when

`npm test` passes with no change for the default layout. Tests with `dir=documentation`, `sections=[guides,rfcs]`, `adr=rfcs`: archive accepts a proposed ADR in `documentation/rfcs`, regenerates that index and stages the right paths; start dirty check covers `documentation`; `change-axi spec proposal` shows the configured dir.
