---
title: Plan workflow
summary: How explore, propose, apply and archive work, and which tool owns what
---

# Plan workflow

```
plan-explore  read-only, reads docs, drafts in conversation
plan-propose  change-axi new/step add/write -> plan files, no commit
(you)         review the diff, commit on main
plan-apply    main: start/enter + treehouse worktree + agent | worktree: run steps
plan-archive  accept ADRs, move to archived/, mark backlog done
```

## Layout

```
docs/{domain,architecture,decisions}/    indexed by docs-axi in docs/README.md
specs/changes/active/<slug>/             proposal.md, NN-*.md, tasks.md
specs/changes/archived/<date>-<slug>/
backlog.md                               one tasks-axi task per change
```

## Ownership

- docs-axi: docs frontmatter, generated index, ADR numbers, sections inside docs.
- change-axi: change folders, step files, dependency edges, plan checks.
- tasks-axi (external): task state and dependencies. See ADR 1.
- treehouse (external): worktrees and branches.
- Skills: prompts only; they call the CLIs.

## Step execution

Pick a ready step, claim it (`change-axi claim`), implement inside `Owns:`, verify Done when, commit own paths only, then `change-axi done` (commits only tasks.md, warns on writes outside Owns). See ADR 4 and ADR 5.

## Launch and orientation

`change-axi enter <slug> [step]` runs the `start` preflight and commit when the change is queued, finds or leases the worktree, then spawns the configured agent command there (cwd = worktree, no `treehouse enter`) with the prompt `apply <slug> [step]`. See ADR 6.

An agent in the worktree orients itself by running bare `change-axi`: on a branch named like an active change it shows progress, steps, in-flight and ready steps, and the next prompt. `change-axi setup` adds an AGENTS.md block that points agents at this; `start` and `enter` hint when it is missing but never edit the file.
