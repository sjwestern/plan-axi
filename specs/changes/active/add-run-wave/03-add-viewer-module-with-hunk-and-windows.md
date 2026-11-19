# 03 - Add viewer module with hunk and Windows git env

Owns: packages/change-axi/src/viewer/, packages/change-axi/test/viewer.test.ts, packages/change-axi/test/fake-hunk.ts
Docs: none

## Goal

A `Viewer` module wraps the hunk CLI so review, feedback, status and clean share one fakeable seam.

## Context

Mirror the backend seam from step 01: an interface, a real implementation, a fake on PATH for tests. hunk is the only viewer for now; the interface leaves room for others. Repo config already has `platform = "windows"`; a Windows worktree has a `.git` file with a `C:/` gitdir that WSL git cannot read, so the viewer runs hunk under `GIT_DIR` and `GIT_WORK_TREE` derived through the `/mnt` path for repos with that platform, and a no-op elsewhere.

## Work

1. `src/viewer/viewer.ts`: `Viewer` interface: `open(worktree, base, opts) -> pane command`, `comments(worktree) -> {noteId, file, line, summary}[]` (user comments only), `reload(worktree, base)`. `NullViewer` returns the commands without running them.
2. `src/viewer/hunk.ts`: `HunkViewer` using spawnSync with argument arrays: `hunk diff --watch <base>...HEAD`, `hunk session comment list --repo <worktree> --type user`, reload via `hunk session reload`. Parse JSON defensively; a failing query returns an empty list plus an unavailable flag, never a throw.
3. `reviewBase(worktree)`: the commit the change branch was created from (first branch reflog entry `branch: Created from <sha>`); falls back to the repo base branch.
4. `gitEnv(repo)`: for `platform = "windows"` repos return `GIT_DIR` (gitdir mapped to `/mnt/<drive>/...`) and `GIT_WORK_TREE`; empty otherwise. Windows worktrees run without `--watch` and with `--exclude-untracked`.
5. `test/fake-hunk.ts` and `viewer.test.ts`: command construction, base from reflog and fallback, user-comment filtering, unavailable query, Windows env mapping.

## Done when

npm test passes with the viewer cases; with no hunk on PATH `comments()` reports unavailable and does not throw.
