# 01 - Repo config and platform runtime

Owns: packages/change-axi/src/repos.ts, packages/change-axi/src/planconfig.ts, packages/change-axi/test
Docs: none
Tier: standard

## Goal

Resolve repos from config and run git/treehouse for each under the right platform.

## Context

Read ADR-0014-changes-span-repos-with-one-worktree-per-repo-and-bases-in and proposal What changes/Approach. Existing git helpers are in src/git.ts and treehouse calls in src/start.ts. Tier: standard, mechanical but platform-sensitive.

## Work

- Add src/repos.ts: parse `[repos.<name>]` (path, platform, git, treehouse) via planconfig; detect runtime (WSL, native Windows, other) with injected platform/env/runner.
- Expand `~` per repo: os.homedir, or the Windows profile via cmd.exe + wslpath under WSL for platform=windows repos.
- RepoRuntime: git(args), treehouse(args) (pwsh.exe wrapper, stdin from /dev/null, wslpath conversion of returned paths under WSL+windows), toNative/toWsl path helpers. platform is ignored outside WSL.
- Unit tests for WSL, native Windows, Linux/Mac, and override precedence.

## Done when

Tests pass for all three platform cases with injected env. No change to single-repo behavior.
