# 01 - Claim command

Owns: packages/change-axi/src/claim.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/claim.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

`change-axi claim <slug> [step]` starts a step safely and prints what the agent needs to implement it.

## Context

Task id = step file stem. Use `tasks-axi start --file specs/changes/active/<slug>/tasks.md`. `start` on a done task reopens it, so check status first via `listTasks`. Without a step arg pick the lowest-id ready step; prefix ids (`01`) allowed, resolve like `dep` does (commands.ts ~276).

## Work

1. `src/claim.ts`: `claim(ctx, slug, stepArg?)` resolves step, errors NOT_FOUND / VALIDATION_ERROR (done, or blocked by active tasks), runs start, returns `{step, already, owns, docs, sections}` with Goal/Context/Work/Done when text.
2. Register in cli.ts with CmdSpec and help line; export handler from commands.ts if that is the pattern.
3. `test/claim.test.ts` with `tempRepo()`: first claim, repeat claim (already true), done step refused, blocked step refused, no-arg picks first ready.

## Done when

`npm test -w packages/change-axi` passes including claim.test.ts; `node packages/change-axi/dist/bin/change-axi.js claim --help` prints usage.
