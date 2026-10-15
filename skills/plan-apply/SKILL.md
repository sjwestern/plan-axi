---
name: plan-apply
description: Implement a committed change plan. On the main branch it starts the change, commits that, leases a treehouse worktree and branch, and produces the agent hand-off prompt. Inside the worktree it runs ready steps one at a time (start, implement, test, commit, done), supporting a second agent on non-overlapping steps. Use when the user says "apply", "implement the change", "start <slug>", "pick up the next step", or "resume".
---

# Apply

Two modes, chosen by the current branch (`git branch --show-current`):

- **Main branch** -> **Launch**: preflight, mark the change in progress, lease a worktree, print the hand-off prompt. Writes no code.
- **Feature branch named like a change slug** -> **Execute**: implement steps in dependency order.

## Conventions

- Plan: `specs/changes/active/<slug>/` (`proposal.md`, `NN-*.md` step files, `tasks.md`). Repo level: `backlog.md`, one task per change, id = slug.
- **`tasks.md` and `backlog.md` are changed only through `tasks-axi`**, always with `--file` after the command, run from the repo (or worktree) root. If missing: `npx -y tasks-axi@0.2.6 <args>`.
- Step task id = step file stem; its body is `Spec: <file>.md`.
- The check script: `plan-propose/scripts/check-plan.mjs` (sibling skill directory). Called `CHECK` below: `node <skills>/plan-propose/scripts/check-plan.mjs <slug> --waves`.
- Docs: `docs-axi` (`npx -y docs-axi@0.1.0` if missing).

## Launch (on main)

1. **Pick the change.** Use the slug given. Otherwise `tasks-axi list --state queued --kind change` (and `--state in_flight`) and ask.
2. **Preflight.** Stop and report if any fails:
   - On the default branch (`main`/`master`) and up to date with its remote if one is configured.
   - Plan committed and clean: `git status --porcelain -- specs/changes/active/<slug> backlog.md docs` prints nothing, and `git log -1 -- specs/changes/active/<slug>` shows a commit. "Commit the plan on main first" otherwise.
   - `CHECK` passes (no cycles, every step has a task, specs exist) and `docs-axi check` passes.
3. **Already in flight?** `tasks-axi show <slug> --file backlog.md`: if in flight, the change was started earlier -> find its worktree (`treehouse status`, branch `<slug>`) and go to step 6 with "resume". Do not start twice.
4. **Start.** `tasks-axi start <slug> --file backlog.md`, then commit only that file on main: `git add -- backlog.md && git commit -m "start <slug>" -- backlog.md`.
5. **Worktree.** `treehouse get --lease -b <slug>` prints the absolute worktree path on stdout (banners go to stderr). Keep the path. The branch is the change slug.
6. **Hand-off.** Do not implement in the main checkout. From `CHECK --waves` and `tasks-axi ready --file ...` tell the user:
   - the worktree path and branch;
   - which steps are ready now, and which of them are parallel-safe (different waves cannot run together; same wave and non-overlapping `Owns:` can). Recommend at most one agent per safe step, and say how many extra panes are useful;
   - the prompts below, filled in.

### Prompt: first agent

```
You are implementing change <slug> in the worktree <path> (branch <slug>).
Read specs/changes/active/<slug>/proposal.md, then follow the plan-apply skill in Execute mode.
Task graph: tasks-axi list --file specs/changes/active/<slug>/tasks.md
Start with: <id> (<Spec file>). Owns: <paths>.
```

### Prompt: additional agent (same worktree)

```
You are working in the worktree <path> (branch <slug>) alongside another agent who is working on task <other-id> (Owns: <paths>) in the same repo. Do not touch those paths.
Follow the plan-apply skill in Execute mode and take only this task: <id> (<Spec file>). Owns: <paths>.
Commit only your own paths.
```

## Execute (in the worktree)

Work is one step at a time per agent. Loop until there are no ready steps you can take:

1. **Pick.** `tasks-axi ready --file specs/changes/active/<slug>/tasks.md`. If told a specific task, use it. Do not take a task whose `Owns:` overlaps a task already in flight (`tasks-axi list --state in_flight --file ...`; read both step files).
2. **Claim.** `tasks-axi start <id> --file ...`. If the output says `already in flight`, another agent has it: pick another. Never `start` a done task (it moves it back to in flight).
3. **Read.** The step file (`Spec:` in `tasks-axi show <id> --full --file ...`), the docs named in its `Docs:` line (`docs-axi show <path>`), and the proposal sections it relates to.
4. **Implement** exactly the step's Work, staying inside `Owns:`. If you must touch other paths, stop: either the plan is wrong (see "Plan changes") or another step owns it.
5. **Verify** the step's "Done when". Run the relevant tests/build. Do not mark done on a failing or unrun check.
6. **Commit own paths only.** Never `git add -A`, `git commit -a`, or stash: another agent may have work in the tree. `git add -- <your paths> && git commit -m "<slug>: <step summary>" -- <your paths>`. If `index.lock` exists, wait and retry; delete it only when no git process is running.
7. **Done.** `tasks-axi done <id> --file ...`, then commit that file: `git add -- specs/changes/active/<slug>/tasks.md && git commit -m "<slug>: done <id>" -- specs/changes/active/<slug>/tasks.md`. (Its diff may include another agent's `start` line; that is accurate.)
8. Back to 1.

For a docs step: edit the files named in `Owns:`, keep them small and single-topic, then `docs-axi update/index` as needed and `docs-axi check`. ADR status stays `proposed` until archive.

When no steps remain: if tasks are still queued but blocked, they wait on another agent's in-flight task - report and stop. If everything is done, tell the user the change is ready for archive (skill `plan-archive`).

## Plan changes during apply

The main-branch plan is frozen; amend it on this branch. Edit the step/proposal files, and change the graph only with `tasks-axi block|unblock|add|rm|update --file ...`. Re-run `CHECK` after every edge edit (cycles are not rejected). Commit the plan change on its own, with a message saying why. Tell the other agent if it affects their task.

## Rules

- Do not implement in the main checkout; do not start a change twice; do not push.
- Never hand-edit `tasks.md` or `backlog.md`.
- One commit per finished step (code + tests), plus its `done` commit.
- Stop and ask when the plan and reality disagree in a way the plan cannot absorb.
