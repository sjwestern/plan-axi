---
title: Task state and dependencies live in tasks-axi
summary: Why plans use tasks-axi for step state and dependencies instead of checkbox lists
status: accepted
---

# Task state and dependencies live in tasks-axi

## Context

Checkbox task lists cannot express dependencies, claims by parallel agents, or states like in flight. Hand-edited lists also drift.

## Decision

Step state and dependencies are stored only by tasks-axi in `specs/changes/active/<slug>/tasks.md`. Nothing edits that file by hand. One task per change lives in repo-level `backlog.md`. Task id is the step file stem; the task body is `Spec: <file>.md`.

## Consequences

- Parallel agents claim steps with `tasks-axi start` (a repeat start reports `already: true`).
- tasks-axi accepts dependency cycles silently, so `change-axi check` and `change-axi dep` detect them.
- `tasks-axi add` on an existing id is a silent no-op, so slugs are checked for reuse.
- change-axi never parses `tasks.md`; it reads `tasks-axi list --fields`.
