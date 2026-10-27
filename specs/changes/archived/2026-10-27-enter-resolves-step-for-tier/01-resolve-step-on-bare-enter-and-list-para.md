# 01 - Resolve step on bare enter and list parallel waves

Owns: packages/change-axi/src/commands.ts, packages/change-axi/test/enter-pick.test.ts
Docs: none

## Goal

Bare `enter <slug>` always launches with a resolved step so its tier profile applies, and lists the choices when several steps are ready.

## Context

The tier lookup already exists in enterCommand and applies only when `step` is set. ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template defines tier to profile resolution. The ready rule is the one `status` uses (queued, no blockers); lift it to a helper rather than copy it.

## Work

1. In commands.ts extract the ready-step computation from the status command into a helper.
2. In enterCommand no-step branch, after the in-flight resume check: one ready step sets `step`; several builds a TOON listing `ready[]{step,tier,profile}` from each step Tier header via tierProfile/resolveAgent, adds help lines for `enter <slug> <step>` and `run <slug>`, and returns before runAgent; none keeps the current message.
3. Keep `--agent` precedence. Keep leasing/starting the worktree before the listing.
4. Tests in test/enter-pick.test.ts (or enter.test.ts patterns): single ready uses tier profile in `--print`; two ready lists and does not launch; in-flight resumes; `--agent` override.

## Done when

`npm test` passes and the four test cases above pass.
