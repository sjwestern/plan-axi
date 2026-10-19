# 01 - Tool commits use conventional format and trailer

Owns: packages/change-axi/src/commitstyle.ts, packages/change-axi/src/git.ts, packages/change-axi/src/start.ts, packages/change-axi/src/done.ts, packages/change-axi/src/archive.ts, packages/change-axi/test/start.test.ts, packages/change-axi/test/done.test.ts, packages/change-axi/test/archive.test.ts, packages/change-axi/test/finish.test.ts, packages/change-axi/test/commit-hook.test.ts, packages/change-axi/test/commitstyle.test.ts
Docs: docs/architecture/plan-workflow.md

## Goal

start, done and archive commit with a configurable conventional subject (default chore(plan)) and a Change trailer, and a rejected commit fails cleanly.

## Context

Defaults: type `chore`, plan_type `docs`, scope `plan`, trailer `Change`; subjects `start change`, `done <step-id>`, `archive change`. Config lives under `[commit]` in `.plan-axi.toml` and user config; read via `loadRawConfig` (see agent.ts `apply.agent`). `plan_type` is used by commit-plan (step 06). Existing git() reports only the first stderr line; hook output (commitlint messages) needs more. Sibling change change:fix-finish-rerun-after-stuck-return edits finish.ts, not these files.

## Work

1. New src/commitstyle.ts: `commitStyle(root)` -> {type, scope, trailer} from `commit.type|plan_type|scope|trailer` with defaults; validate (type/plan_type/scope `[a-z0-9-]+` or empty scope, trailer a token or empty) and throw VALIDATION_ERROR naming the key and file.
2. git.ts: add `commit(ctx, subject, slug, paths?)`: header `type(scope): subject` (helper takes the type so commit-plan can pass plan_type) (no parens when scope empty), `-m header`, plus `-m "Trailer: slug"` unless trailer empty; on failure throw AxiError `commit rejected` code GIT_ERROR with up to ~15 lines of stderr as details.
3. start.ts, done.ts: use it; on rejection restore the changed file (`git restore --staged --worktree -- <file>`) before rethrowing so a rerun works.
4. archive.ts: use it for `--commit`; on rejection leave changes staged and add the hint `Changes are staged; fix the hook problem and run git commit`.
5. Update subject assertions in start/archive/finish tests; add trailer assertions (`git log -1 --format=%(trailers:key=Change,valueonly)`).
6. New commit-hook.test.ts: rejecting commit-msg hook -> start and done fail with `commit rejected`, state unchanged and rerun after removing the hook succeeds; archive leaves staged changes. New commitstyle.test.ts: defaults, overrides (`scope = ""`, `trailer = ""`, other type), invalid values.

## Done when

`npm test -w packages/change-axi` passes, including commit-hook.test.ts and commitstyle.test.ts. With defaults `git log -1 --format=%B` shows `chore(plan): ...` and `Change: <slug>`; with `[commit] scope = ""` there are no parens.
