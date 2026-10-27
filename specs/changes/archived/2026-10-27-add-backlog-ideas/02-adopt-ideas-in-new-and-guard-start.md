# 02 - Adopt ideas in new and guard start

Owns: packages/change-axi/src/commands.ts, packages/change-axi/src/change.ts, packages/change-axi/src/start.ts, packages/change-axi/src/where.ts, packages/change-axi/test/backlog-adopt.test.ts
Docs: none

## Goal

`change-axi new` promotes an unplanned backlog item into a change, and `start` refuses items without a plan.

## Context

Depends on `src/backlog.ts` from step 1 (`slugTaken`, `UNPLANNED_KINDS`). `resolveChange` has a `backlog` state today that `new` treats as taken; it must now distinguish unplanned items (kind idea|bug|chore) from planned ones (kind change). `tasks-axi update <id> --kind change` flips the kind. Renaming with `--from` adds the new item then removes the old with `tasks-axi rm`; do both or neither, and carry title, body, priority, repo and blocked-by links.

## Work

1. `change.ts`: `resolveChange` returns the item kind for backlog-only results. Callers that assume "backlog means queued change" are updated.
2. `commands.ts` `newCommand`: add `--from <old-slug>` and make the title optional when adopting. If the slug is an unplanned backlog item, adopt: update kind to change, keep the title if none is given, scaffold the plan, seed Why from the item body. If it is a `change` item, active or archived, error as before. With `--from`, validate the old item is unplanned and the new slug passes `slugTaken`, then create the new item, copy fields and blocked-by links, remove the old one, and roll back if any call fails. Show carried blocked-by links in the output.
3. `start.ts` and the `plan-apply` guard: refuse an item with an unplanned kind: "propose it first" with the `change-axi new <slug>` hint.
4. `where.ts`: report unplanned items as state backlog with their kind.
5. Tests in `test/backlog-adopt.test.ts` covering adopt, adopt with a new title, `--from` rename with carried fields, rollback on failure, collisions, start refusal, and where output.

## Done when

`npm test -w packages/change-axi` passes. In a scratch repo: `change-axi idea "x"`, `change-axi new <slug>` leaves one backlog item of kind change and a proposal with Why seeded; `change-axi new <new> --from <old>` leaves no `<old>` item; `change-axi start <idea-slug>` exits with an error that says to propose it first.
