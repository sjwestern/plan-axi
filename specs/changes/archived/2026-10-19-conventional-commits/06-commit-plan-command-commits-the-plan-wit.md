# 06 - commit-plan command commits the plan with the right message

Owns: packages/change-axi/src/commitplan.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/commitplan.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

The human runs `change-axi commit-plan [<slug>]` to save a plan the agent just generated; the message follows the config and uses the slug. With no slug it picks the new, not-yet-committed plan.

## Context

The human commits the plan (ADR-0004-plans-are-committed-on-main-steps-run-in-a-worktree); the agent never does. Uses the commit helper and `commitStyle` from step 01 (type/plan_type/scope/trailer). Plan paths: `specs/changes/active/<slug>`, `backlog.md`, and the docs dir from `docs-axi config` (new docs and ADRs). start.ts line ~153 already treats these paths as "the plan". Also used for plan amendments on a branch. Never stages other paths.

## Work

1. src/commitplan.ts `commitPlan(ctx, slug?, {reason?, dryRun?})`. Slug resolution when omitted: list active changes whose folder has `git status --porcelain` entries (untracked or modified, staged or not); exactly one -> use it; none -> `NOTHING_TO_COMMIT`; several -> VALIDATION_ERROR listing them and asking for a slug. An explicit slug skips detection.
2. Run the plan check and fail on errors. Stage only the plan paths (plan folder, backlog.md, docs dir) and commit via the step 01 helper with subject `propose <slug>` (or `<reason>` with `--reason`, for amendments) using `plan_type`, plus the trailer. Report the short hash and files committed; list other dirty files as a warning, not staged.
3. `--dry-run` prints the full message and paths without committing.
4. Register in commands.ts and cli.ts (`commit-plan`, in TOP_HELP and the command count). The command help states that it is the human step after plan-propose.
5. commitplan.test.ts: slug auto-detect (one, none, several), explicit slug, default message and trailer, config overrides, `--reason`, other dirty files left unstaged, invalid plan refused, dry-run, hook rejection restores the index (git reset on the staged paths).

## Done when

`npm test -w packages/change-axi` passes. In a temp repo with one uncommitted plan, `change-axi commit-plan` (no slug) makes a commit whose `git log -1 --format=%B` is `docs(plan): propose demo` plus `Change: demo`; with two uncommitted plans it fails listing both; `--reason "drop step 03"` gives `docs(plan): drop step 03`; `--dry-run` commits nothing.
