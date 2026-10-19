# 02 - Docs-axi commands use the layout

Owns: packages/docs-axi/src/indexgen.ts, packages/docs-axi/src/commands/read.ts, packages/docs-axi/src/commands/write.ts, packages/docs-axi/src/commands/check.ts, packages/docs-axi/src/commands/sections.ts, packages/docs-axi/test/cli.test.ts, packages/docs-axi/test/sections.test.ts
Docs: none

## Goal

docs-axi read, write, check, index and init work against the resolved layout, behavior unchanged for the default layout.

## Context

Depends on step 01's Layout. `decisions` special cases (≈12 sites in write.ts, check.ts, indexgen.ts, model.ts) become `=== layout.adr`. ADR commands must error with a hint when `layout.adr` is unset. Home output keeps its `sections` block, now from the layout.

## Work

1. `indexgen.ts`: headings and intro derive from the layout (title-case the name), ordered by `sections`; README intro uses each section's guide.
2. `write.ts`: `init` creates the configured section dirs; `new <section>` validates against the layout and lists names with guides in help and errors; `adr`, `update`, `supersede` require an ADR section.
3. `check.ts`: ADR_BAD_NAME and ADR rules apply to the ADR section only; unknown top-level folders are UNMANAGED.
4. `read.ts`/`sections.ts`: list/search sections and home `sections` block from the layout; help text no longer names the three folders.

## Done when

`npm test` passes with no output change for the default layout (existing tests untouched). New tests with `sections=[guides,reference,rfcs]`, `adr=rfcs`: init, new, adr numbering, update/supersede, check, index and home all use those names. With no ADR section, `adr` errors with the config hint.
