# 01 - Lease holder and JSON status

Owns: packages/change-axi/src/start.ts, packages/change-axi/test/start.test.ts, packages/change-axi/test/status-rows.test.ts
Docs: none

## Goal

Worktrees are leased with the change slug as holder, and statusRows exposes lease_holder from treehouse status --json.

## Context

Treehouse keeps lease_holder after `return` resets the slot (detached, no branch). Step 02 relies on a row field `leaseHolder` and `status`. Old treehouse without --json or --lease-holder must keep working.

## Work

1. In start.ts, pass `--lease-holder <slug>` to `treehouse get --lease` (enter path included); on an unknown-flag error, retry without it.
2. Make statusRows run `treehouse status --json` and map to {name, path, branch, leaseHolder, status}; on failure fall back to parseStatusRows (no leaseHolder).
3. Add tests for JSON parsing, text fallback, and the holder flag.

## Done when

`npm test` passes, including new cases in start.test.ts and status-rows.test.ts.
