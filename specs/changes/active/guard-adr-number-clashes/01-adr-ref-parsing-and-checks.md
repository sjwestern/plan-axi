# 01 - ADR ref parsing and checks

Owns: packages/docs-axi/src/adrrefs.ts, packages/docs-axi/src/commands/check.ts, packages/change-axi/src/check.ts, packages/docs-axi/test/adrrefs.test.ts
Docs: none

## Goal

A shared parser finds and resolves ADR-NNNN-slug refs; both check commands report unresolved and bare refs.

## Context

ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. Existing ADR_DUPLICATE_NUMBER in docs-axi check stays. Skip code fences and inline code. change-axi imports docs-axi/lib/<module> without .js.

## Work

1. docs-axi src/adrrefs.ts: findRefs(text), resolveRef(ref, adrs), findBareRefs(text) (`ADR 7`, `ADR 0007`, `ADR-7`).
2. docs-axi check: ADR_REF_UNKNOWN (number or slug mismatch) and ADR_REF_BARE over docs dir.
3. change-axi check: same for proposal and step files of the change.
4. Messages say the expected form and the fix.

## Done when

test/adrrefs.test.ts passes: valid ref resolves, wrong slug and wrong number fail, bare forms flagged, code fences ignored. docs-axi check and change-axi check show the new codes. npm test passes.
