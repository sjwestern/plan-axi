---
title: Plan workflow
summary: How explore, propose, apply and archive work, and which tool owns what
---

# Plan workflow

```
plan-explore  read-only, reads docs, drafts in conversation
plan-propose  change-axi new/step add/write -> plan files, no commit
(you)         review the diff, commit on main
plan-apply    main: start + treehouse worktree + prompt | worktree: run steps
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

Pick a ready step, claim it (`tasks-axi start`), implement inside `Owns:`, verify Done when, commit own paths only, `tasks-axi done`. See ADR 4 and ADR 5.
