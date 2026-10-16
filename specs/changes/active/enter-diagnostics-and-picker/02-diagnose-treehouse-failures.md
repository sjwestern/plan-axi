# 02 - Diagnose treehouse failures

Owns: packages/change-axi/src/start.ts, packages/change-axi/test/diagnose.test.ts
Docs: none

## Goal

When treehouse get fails, enter reports the cause and a fix hint instead of a progress line.

## Context

tryTreehouse now shows the last 3 stderr lines. This step adds git-based diagnosis: branch exists, unique commit count, branch checked out in another worktree (git worktree list --porcelain), base unresolved.

## Work

1. Add diagnose(ctx, slug, stderr) in start.ts returning {cause, hint}.
2. Call it from leaseWorktree when tryTreehouse throws; rethrow AxiError TREEHOUSE_ERROR with cause in message and hint in help.
3. Tests in diagnose.test.ts with a failing fake treehouse for each cause.

## Done when

npm test passes; each cause yields a distinct message and a hint line.
