---
name: plan-apply
description: Implement a committed change plan. On the main branch it starts the change, commits that, leases a treehouse worktree and branch, and produces the agent hand-off prompt. Inside the worktree it runs ready steps one at a time (start, implement, test, commit, done), supporting a second agent on non-overlapping steps. Use when the user says "apply", "implement the change", "start <slug>", "pick up the next step", or "resume".
---

# Apply

Two modes, chosen by running bare `change-axi` and reading its `branch` and `worktree`/`checkout` lines (never `git branch --show-current`):

- **`branch` is the default branch (`checkout` shown)** -> **Launch**: preflight, mark the change in progress, lease a worktree, print the hand-off prompt. Writes no code.
- **`branch` is a change slug (`worktree` shown)** -> **Execute**: implement steps in dependency order.

## Conventions

- Plan: `specs/changes/active/<slug>/` (`proposal.md`, `NN-*.md` step files, `tasks.md`). Repo level: `backlog.md`, one task per change, id = slug.
- **`tasks.md` and `backlog.md` are changed only through `tasks-axi`**, always with `--file` after the command, run from the repo (or worktree) root. If `tasks-axi` is "command not found", fall back to `npx -y tasks-axi@0.2.6 <args>`.
- Step task id = step file stem; its body is `Spec: <file>.md`.
- Plan tool: `change-axi` (`enter`/`start` launch, `finish` merges and releases the worktree, `archive` only archives; bare `change-axi` on a change branch shows its status) (call the binary on PATH; if "command not found", stop and tell the user to install it with `npm run build && npm link`). `CHECK` below = `change-axi check <slug> --waves`. `change-axi status <slug>` shows steps, waves and what is ready. `change-axi show <slug> <step> [--section Work]` reads a step or one section of it.
- Models: `change-axi config` (no flags) shows the profile, tier and agent setup; set models with its flags (`--profile --harness --model --effort --tier`, `--user` for personal choices) and live-check with `change-axi config --verify`. Never hand-edit `.plan-axi.toml` for this.
- Doc edits cheat-sheet: `printf '<text>' | change-axi write|append <slug> <proposal|step-id> --section "<name>"`. Only slug and doc are positional; the section is `--section`, never a third positional. Body: stdin, `--body "..."` or `--body-file <path>`. Bare `change-axi` prints `branch` and `worktree` (or `checkout` when not a linked worktree); never run `git branch --show-current`.
- Docs: `docs-axi` (binary on PATH; if "command not found", stop and tell the user to install it).

## Launch (on main)

1. **Pick the change.** Use the slug given. Pick from changes only: unplanned items (kind idea, bug, chore; see `change-axi backlog`, captured with `change-axi idea`) must go through plan-propose first, and `change-axi start` refuses them with "propose it first". Otherwise `tasks-axi list --state queued --kind change` (and `--state in_flight`) and ask.
2. **Dry run.** `change-axi start <slug> --dry-run`. Preflight: on the default branch and not behind its remote, plan committed and clean, `change-axi check` passes, backlog task queued. Fix what it reports (usually "commit the plan on main first"). Also run `docs-axi check`.
3. **Start.** Prefer `change-axi enter <slug> [step]` from main (the agent runs as a child process with the worktree as cwd; no `treehouse enter` needed): it does the start below, then runs the configured agent in the worktree (`--print` only prints the path and command; no agent configured: it prints them). `enter` live-checks a profile's model and effort first; if it reports an invalid profile, fix it with `change-axi config --profile ...` (see `config --verify`), not by hand-editing the TOML or passing `--no-verify`. `change-axi start <slug>` alone does the same start without launching an agent. It marks the change in flight, commits only `backlog.md` (as `chore(plan): start <slug>` with a `Change: <slug>` trailer), and leases a treehouse worktree on branch `<slug>` (reusing an existing one). An already started change is not started twice; the worktree is looked up instead. `--no-worktree` skips the lease.
4. **Hand-off.** Do not implement in the main checkout. From the output (`worktree`, `enter`, `ready` with each step's Owns, `waves`) tell the user:
   - the worktree path and id (run the `enter` command from the output) and the branch;
   - which steps are ready now and which are parallel-safe (same wave and non-overlapping `Owns:` can run together; recommend at most one agent per safe step);
   - the prompts below, filled in.

### Prompts

The skill picks its mode from the branch, so prompts stay short. Give the user these (filled in):

- First agent, worktree `<path>` (launched by `change-axi enter <slug> [step]`, which the human runs from main): `apply <slug> <step-id>` (that step only, then stop; `enter` resolves the step so its tier profile applies). Bare `change-axi enter <slug>` picks the single ready step, or lists the ready wave when several are ready; launch each with `enter <slug> <step>`. `apply <slug>` alone takes the next ready step and loops on one model.
- Another agent in the same worktree: `apply <slug> <step-id>` for a parallel-safe step. Execute step 1 makes it skip steps whose `Owns:` overlap an in-flight step.

## Execute (in the worktree)

**Bootstrap first.** In a fresh worktree, if `node_modules` or build output is missing, run the repo's bootstrap (see AGENTS.md or CONTRIBUTING) before anything else.

Then run bare `change-axi` for orientation: it prints the branch, worktree path, progress, in-flight and ready steps. Do not run `git branch --show-current`; the branch is the change slug. Work is one step at a time per agent. Given a step id (`apply <slug> <id>`), do that step only and stop. Otherwise loop until there are no ready steps you can take. Read the proposal only by section (`change-axi show <slug> proposal --section <name>`), starting with Why.


1. **Pick.** `tasks-axi ready --file specs/changes/active/<slug>/tasks.md`. If told a specific task, use it. Do not take a task whose `Owns:` overlaps a task already in flight (`tasks-axi list --state in_flight --file ...`; read both step files).
2. **Claim.** `change-axi claim <slug> [id]` starts the step and prints Owns, Docs and Goal/Context/Work/Done when. `already: true` means another agent has it: pick another. It refuses done and blocked steps.
3. **Read.** The step: `change-axi show <slug> <id>` (read only the sections you need with `--section`), the docs named in its `Docs:` line (`docs-axi show <path>`), and the proposal sections it relates to.
4. **Implement** exactly the step's Work, staying inside `Owns:`. If you must touch other paths, stop: either the plan is wrong (see "Plan changes") or another step owns it. If the step touches CLI code, smoke-test with the repo's in-worktree form (named in AGENTS.md), not the global binary, which is the main checkout's build.
5. **Verify** the step's "Done when". Run the relevant tests/build. Do not mark done on a failing or unrun check.
6. **Commit own paths only.** Never `git add -A`, `git commit -a`, or stash: another agent may have work in the tree. `git add -- <your paths> && git commit -m "<type>(<area>): <summary>" -m "Change: <slug>" -- <your paths>`. Use a conventional-commit type (`feat`, `fix`, `refactor`, `test`, `docs`); `<area>` is the package or feature touched (e.g. `docs-axi`), not the slug. The `Change` trailer links the commit to the change. If `index.lock` exists, wait and retry; delete it only when no git process is running.
7. **Done.** `change-axi done <slug> <id>` (after your own work commit). It marks the step done and commits only tasks.md. Act on any `OUTSIDE_OWNS` warning (its diff may include another agent's `start` line; that is accurate).
8. Back to 1.

For a docs step: edit the files named in `Owns:`, keep them small and single-topic, then `docs-axi update/index` as needed and `docs-axi check`; if it reports ADR ref errors run `docs-axi adr fix-refs`, and for a number clash `docs-axi adr renumber <ref>`. ADR status stays `proposed` until archive.

When no steps remain: if tasks are still queued but blocked, they wait on another agent's in-flight task - report and stop. If everything is done, first run `change-axi finish <slug> --dry-run` from this worktree. If it reports a rebase is needed, run `git rebase <base>`, resolve conflicts, rerun the tests, and check again; fix any other error it reports and commit. Then tell the user the change is ready to finish. From the main checkout, run this (it archives if needed, merges, releases the worktree; add `--dry-run` to preview):

```sh
change-axi finish <slug>
```

See skill `plan-archive`.

## Plan changes during apply

The main-branch plan is frozen; amend it on this branch. Edit sections with `change-axi write|append`, add steps with `change-axi step add`, change order with `change-axi dep`. Change the graph with `change-axi dep` (it reverts cycles) and edit plan text with `change-axi write`; re-run `CHECK`. Commit the plan change on its own with `change-axi commit-plan <slug> --reason "<why>"` (message `docs(plan): <why>` plus the `Change` trailer); if it is not available, use `git commit -m "docs(plan): <why>" -m "Change: <slug>"`. Tell the other agent if it affects their task.

## Rules

- Do not implement in the main checkout; do not start a change twice; do not push.
- Never hand-edit `tasks.md` or `backlog.md`.
- One commit per finished step (code + tests), plus its `done` commit.
- Stop and ask when the plan and reality disagree in a way the plan cannot absorb.
- Copyable commands: put every command the user may paste in its own fenced code block, one command per line, after the sentence that introduces it. Never end a prose sentence with a command and never split one across lines; for long ones use a short form, a variable, or a script.
