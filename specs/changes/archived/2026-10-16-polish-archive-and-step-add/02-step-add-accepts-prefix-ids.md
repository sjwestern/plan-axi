# 02 - Step add accepts prefix ids

Owns: packages/change-axi/src/commands.ts, packages/change-axi/test/flow.test.ts
Docs: none

## Goal

`step add --after 01` resolves to the full step id like `dep` does.

## Context

stepAdd validates `--after` against `known` task ids exactly (commands.ts ~190). The `dep` handler resolves prefix via `tasks.find(...) ?? filter(startsWith(`${id}-`))` (~276). Extract a shared helper rather than copy.

## Work

1. Extract `resolveStepId(known, id)` in commands.ts from the dep logic; ambiguous = error listing matches.
2. Use it in stepAdd for each `--after` item; pass resolved ids to tasks-axi and to the output.
3. Add flow.test.ts case: `step add --after 01` blocks on `01-<name>`; unknown prefix errors NOT_FOUND.

## Done when

`npm test -w packages/change-axi` passes including the new flow case; dep tests unchanged and green.
