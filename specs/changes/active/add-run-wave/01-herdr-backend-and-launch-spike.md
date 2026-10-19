# 01 - Herdr backend and launch spike

Owns: packages/change-axi/src/run/backend.ts, packages/change-axi/src/run/herdr.ts, packages/change-axi/test/herdr-backend.test.ts, packages/change-axi/test/fake-herdr.ts
Docs: docs/architecture/plan-workflow.md

## Goal

A tested backend that opens a herdr tab in the current workspace, launches a command in it, and reads the agent state, plus a recorded decision on `pane run` versus `agent start`.

## Context

Herdr 0.9.5 CLI. `tab create` returns JSON with `.result.tab.tab_id` and `.result.root_pane.pane_id`; without `--workspace` it uses the active workspace, so always pass `$HERDR_WORKSPACE_ID`. Env injected into panes: `HERDR_ENV=1`, `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID`. Never touch herdr from outside it. Never close tabs, never use `herdr worktree`. `agent get|wait` accept a pane id. Interfaces for step 02: `Backend.launch({label, cwd, command}) -> {tab, pane}` and `Backend.status(pane) -> idle|working|blocked|done|unknown`; a `PrintBackend` returns the commands it would run.

## Work

1. Spike (record the outcome as a short comment in `herdr.ts`): in a real herdr pane try `pane run <pane> "pi --model ... '<prompt>'"` and then `herdr agent get <pane>`; compare with `agent start <name> --kind pi --pane <pane> -- <args>` then `agent prompt`. Keep `pane run` unless it fails to report agent state.
2. `src/run/backend.ts`: the `Backend` interface, `PrintBackend`, and `detectBackend(env)` (herdr when `HERDR_ENV=1` and `HERDR_WORKSPACE_ID` is set and `herdr workspace get` succeeds, else print).
3. `src/run/herdr.ts`: `HerdrBackend` using `child_process.spawnSync("herdr", args)` with argument arrays (no shell string building for herdr args; shell-quote only the command passed to `pane run`). Parse JSON defensively; any missing id throws an `AxiError` before any pane runs.
4. `test/fake-herdr.ts`: an executable script writing each call to a log and returning canned JSON; tests cover launch call order, flags (`--workspace`, `--cwd`, `--label`, `--no-focus`), failure on bad JSON, status mapping including unknown.

## Done when

`npm test` passes. Manual spike in a real herdr session opens a tab labelled `test/step` under the current workspace without taking focus, runs a pi command there, and `herdr agent get <pane>` returns a state; the result is noted in `herdr.ts`.
