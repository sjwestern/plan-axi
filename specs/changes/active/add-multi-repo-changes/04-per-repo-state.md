# 04 - Per-repo state in home, status and done

Owns: packages/change-axi/src/home.ts, packages/change-axi/src/done.ts, packages/change-axi/src/commands.ts
Docs: none

## Goal

Show and check per-repo state in home, status and done.

## Context

Bare change-axi output is in src/home.ts, done logic in src/done.ts. Branch and worktree for the plan repo already print (whereAmI). Tier: standard.

## Work

- Bare change-axi and status list each Repos entry with branch, worktree path and clean/dirty using that repo runtime git.
- done diffs each external repo against its base and reports OUTSIDE_OWNS per repo, matching `<repo>:` Owns prefixes.
- Tests with injected runtime.

## Done when

Home/status show per-repo rows; done flags an edit outside Owns in an external repo.
