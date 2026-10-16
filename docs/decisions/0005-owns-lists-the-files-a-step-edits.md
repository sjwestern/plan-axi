---
title: Owns lists the files a step edits
summary: Why steps declare a write set and how it is used for parallel safety
status: accepted
---

# Owns lists the files a step edits

## Context

Steps in the same wave can run in parallel. Safe parallelism needs to know which files each step writes.

## Decision

Each step file has an `Owns:` line of repo-relative paths or globs the step edits. Read-only context goes in `Docs:` or Context. Tool-owned directories (`.agents`, `.pi`, `.claude`, ...) may be owned only when the proposal names the path.

## Consequences

- `change-axi check` warns when two steps that can run in parallel overlap, and errors on unnamed tool dirs.
- The check is only as good as the declared paths; it does not inspect the diff.
