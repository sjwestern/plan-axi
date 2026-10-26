---
title: Plan workflow
summary: How explore, propose, apply and archive work, and which tool owns what
---

# Plan workflow

```
plan-explore  read-only, reads docs, drafts in conversation
plan-propose  change-axi new/step add/write -> plan files, no commit
(you)         review the diff, `change-axi commit-plan` on main
plan-apply    main: start/enter + treehouse worktree + agent | worktree: run steps
plan-archive  accept ADRs, move to archived/, mark backlog done
finish        (change-axi) from main: archive if needed, ff-merge, release worktree
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
- tasks-axi (external): task state and dependencies. See ADR-0001-task-state-and-dependencies-live-in-tasks-axi.
- treehouse (external): worktrees and branches.
- Skills: prompts only; they call the CLIs.

## Step execution

Pick a ready step, claim it (`change-axi claim`), implement inside `Owns:`, verify Done when, commit own paths only, then `change-axi done` (commits only tasks.md, warns on writes outside Owns). See ADR-0004-plans-are-committed-on-main-steps-run-in-a-worktree and ADR-0005-owns-lists-the-files-a-step-edits.

## Commit format

All commits are conventional (`type(scope): subject`) and carry a `Change: <slug>` trailer, so history is machine-readable and satisfies commitlint. See ADR-0010-commits-are-conventional-with-a-change-trailer.

| Commit | Written by | Message |
| --- | --- | --- |
| start | `change-axi start` | `chore(plan): start <slug>` |
| done | `change-axi done` | `chore(plan): done <slug> <step-id>` |
| archive | `change-axi archive --commit` | `chore(plan): archive <slug>` |
| plan | `change-axi commit-plan` (human) | `docs(plan): propose <slug>`, or `docs(plan): <reason>` with `--reason` |
| step work | agent | `<type>(<area>): <summary>`, `feat`/`fix`/`refactor`/`test`/`docs`, area = package or feature |

Type, plan type, scope and trailer key are configurable under `[commit]`. If a commit hook rejects a tool commit, the command fails with `commit rejected` and the hook output. `start` and `done` restore their file so a rerun works; `archive` leaves its changes staged for you to fix and commit.

## Launch and orientation

`change-axi enter <slug> [step]` runs the `start` preflight and commit when the change is queued, finds or leases the worktree, then spawns the configured agent command there (cwd = worktree, no `treehouse enter`) with the prompt `apply <slug> [step]`. See ADR-0006-agent-launch-uses-a-command-template.

Agent choice: `--agent <profile>`, then the step's `Tier:` through `[apply.tiers]`, then `[apply] agent`, env, autodetect (ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template). plan-propose reads `change-axi guidance` and sets each step's tier at proposal time; the human edits it in review, and apply only resolves it.

Existing branch: when a worktree already has `<slug>` checked out it is reused. Otherwise, if branch `<slug>` exists, it is compared with the default branch. No commits beyond the default branch: the branch is deleted and recreated. Commits present: the branch is kept, a free worktree is leased without `-b`, and `git switch <slug>` runs there (failure gives `GIT_ERROR`, e.g. branch checked out elsewhere). If the comparison cannot be made (`rev-list` fails, e.g. no `main`/`master`), `enter` stops with `VALIDATION_ERROR` and never deletes: inspect with `git log <base>..<slug>`, then delete the branch or `git switch <slug>` in a free worktree by hand.

Resume: without a step, `enter` reads the worktree's tasks file. Exactly one in-flight step is resumed (prompt `apply <slug> <step>`). Zero or several: the prompt is `apply <slug>`.

`change-axi finish <slug> [--dry-run]` closes the change from the main checkout: it archives on the branch when not yet archived (same checks as `archive`), fast-forward merges the branch into the default branch, then runs `treehouse return` on the worktree's slot. Worktrees are leased with the slug as lease holder, so finish finds the slot by branch label or, after a stuck return (live processes, usually an editor; the slot is reset but stays leased), by holder. Rerunning finish after closing the editor skips archive and merge when already done, returns the slot, and honors `--delete-branch`. Slots leased before lease holders existed need a manual `treehouse return <name>` once. `archive` stays available for a review gate before merging.

An agent in the worktree orients itself by running bare `change-axi`: on a branch named like an active change it shows progress, steps, in-flight and ready steps, and the next prompt. `change-axi setup` adds an AGENTS.md block that points agents at this; `start` and `enter` hint when it is missing but never edit the file. The block also tells agents to start at the docs index (`docs-axi`, then `search` and `show`, `rg docs/` as fallback) for doc lookup, exploration and planning.
