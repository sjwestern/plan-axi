# 02 - run command

Owns: packages/change-axi/src/run/run.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/run.test.ts
Docs: none

## Goal

`change-axi run <slug>` launches the current wave through the backend and prints a status table.

## Context

Reuse `checkChange` waves, `listTasks`, the worktree lookup from `enter` (`leaseWorktree`) and `resolveAgent` plus `buildProfileCommand` from `add-agent-profiles` (the step's tier is read from the step file as `enter` does). Starting a step means `tasks-axi start` through the existing claim helper, as `change-axi start`/`apply` does, so state stays in the worktree branch. The wave is the lowest wave with unfinished steps; launch only those that are ready (deps done) and not in flight with a live tab. Tab labels are `<slug>/<step>`; live tabs are found with `herdr tab list --workspace` by label (labels are not unique, so only for reporting, never to choose a workspace). `run` never archives or closes.

## Work

1. `src/run/run.ts`: `runWave(ctx, slug, opts)` selecting steps (`--only`), building each command, calling `backend.launch`, then `backend.status` unless `--no-status`.
2. Prompt is `apply <slug> <step>`; command from `resolveAgent(path, {profile, tierProfile})`; if none resolves, error with the config hint used by `enter`.
3. Idempotence: skip done steps; for in-flight steps with a live tab report state and do not relaunch; do not move to wave N+1 until wave N is done (print which wave is blocking).
4. `--dry-run` prints per step: tab label, cwd, profile and provenance, and the exact commands; changes nothing, starts nothing.
5. Output TOON: `wave`, `steps[]{step,profile,tab,state}`, help with the next action (review, then `run` again).
6. Register `run` in `commands.ts` and `cli.ts` with usage text.
7. `run.test.ts` with the fake herdr: two-step wave opens two tabs; rerun opens none; wave gating; dry-run and print fallback outside herdr; `--only`.
8. Re-add the second help line in `enterCommand`'s multi-ready listing (removed as a dead hint before `run` existed): ``Or run `change-axi run <slug>` to run them``.

## Done when

`npm test` passes. Against the fake herdr, a two-step wave logs two `tab create` and two `pane run` calls and prints a two-row table; a second run logs no new `tab create`; `--dry-run` logs nothing.
