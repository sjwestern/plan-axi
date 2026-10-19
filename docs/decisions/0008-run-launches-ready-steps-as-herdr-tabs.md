---
title: Run launches ready steps as herdr tabs
summary: Why run opens one herdr tab per step under the current workspace and stops per wave
status: proposed
---

# Run launches ready steps as herdr tabs

## Context

Controllers run parallel steps by hand in separate terminals. firstmate shows herdr tabs per task, but is agent-controlled. Plan-axi needs a human-controlled wave launcher.

## Decision

change-axi run launches the ready wave: one herdr tab per step in the controller's workspace, cwd the change worktree, started with pane run using the resolved profile command. It reports status and stops; the human reviews and re-runs. herdr worktree is not used.

## Consequences

Visible parallel work with no new session manager. Requires herdr and HERDR_ENV; otherwise it prints commands. No supervision or auto-continue; those are later work.
