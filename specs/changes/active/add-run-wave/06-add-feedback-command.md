# 06 - Add feedback command

Owns: packages/change-axi/src/review/feedback.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/feedback.test.ts
Docs: none

## Goal

`change-axi feedback [slug]` lists your review comments; `--send` tells the working agent to address them.

## Context

Comments come from Viewer.comments across the change's worktrees (keep the review panes open: closing a hunk pane loses its session). The agent pane is the one whose cwd is the change worktree; `--pane <id>` overrides. Never sends to a pane whose agent is working unless `--force`.

## Work

1. `src/review/feedback.ts`: gather comments per worktree; print rows (repo, file, line, summary) and a count; an empty list says so definitively.
2. `--send`: find the agent pane via Backend, refuse if its state is working (unless `--force`), and send a prompt naming each worktree and the hunk command to list user comments and to reply (`hunk session comment add --reply-to <noteId>`).
3. Flags: `--send`, `--pane <id>`, `--repo <name>` (repeatable), `--force`.
4. `feedback.test.ts`: list, empty state, send, refusal while working, `--pane`, `--force`.

## Done when

npm test passes; `feedback` prints comments without sending, and `--send` against a working fake agent is refused with a help line.
