---
name: plan-archive
description: Finish a change. Verifies every task is done and docs are updated, accepts the change's ADRs, moves specs/changes/active/<slug> to specs/changes/archived/YYYY-MM-DD-<slug>, and marks the change done in the repo backlog. Works on the feature branch (preferred) or on main after the branch is merged. Use when the user says "archive", "finish the change", or "close out <slug>".
---

# Archive

Close a completed change. The archive is history only: current truth lives in `docs/`.

## Conventions

- Active: `specs/changes/active/<slug>/`. Archived: `specs/changes/archived/<YYYY-MM-DD>-<slug>/` with the whole folder (including `tasks.md`, all tasks Done).
- Date = **local** date, ISO: `node -p "new Date().toLocaleDateString('sv-SE')"` (works on Windows, Linux, macOS).
- Task files change only through `tasks-axi ... --file`, from the repo root. `npx -y tasks-axi@0.2.6` / `npx -y docs-axi@0.1.0` if not installed.
- `CHECK` = `node <skills>/plan-propose/scripts/check-plan.mjs <slug>`.

## Where to run

- **On the feature branch (preferred).** The branch carries the final state; archive is its last commit, so one merge brings code, docs, history and backlog together.
- **On main, after merge.** Allowed only when the branch is merged: `git branch --merged` (or `git merge-base --is-ancestor <slug> HEAD`) includes `<slug>`, and `specs/changes/active/<slug>/` still exists.
- Anywhere else (another branch, dirty tree) -> stop and say why.

## Steps

1. **Clean tree** for the touched paths: `git status --porcelain -- specs docs backlog.md` prints nothing.
2. **All tasks done.** `tasks-axi list --state queued --file specs/changes/active/<slug>/tasks.md`, then `--state in_flight`, then `--state held`: all must be empty. Otherwise list them and stop (the user may finish them or drop them with `tasks-axi rm`).
3. **Plan sanity.** `CHECK` has no errors; `docs-axi check` passes.
4. **Docs impact met.** Read `## Docs impact` in `proposal.md`. Each listed path must exist; for each, `git diff --name-only <default-branch>...HEAD` (branch mode) or the merged range (main mode) must include it. Report any listed doc that was not touched; unless the proposal says `None - <reason>`, stop and ask. Do not archive with stale docs.
5. **Decisions.** For each ADR the plan created (`status: proposed`, listed in Docs impact): confirm the decision matches what was built, then `docs-axi update <number> --status accepted`. If it replaces an earlier ADR: `docs-axi supersede <old> --by <new>`. Ask the user if an ADR no longer matches.
6. **Move.** `git mv specs/changes/active/<slug> specs/changes/archived/<date>-<slug>`. Refuse if the target exists.
7. **Backlog.** `tasks-axi done <slug> --file backlog.md` (already done = no-op).
8. **Commit** the move, docs and backlog together: `git add -- specs docs backlog.md && git commit -m "archive <slug>"`.
9. **Report**: archived path, docs changed, ADRs accepted. Branch mode: tell the user to merge `<slug>` into main from the main checkout, then release the worktree (`treehouse return <path>`). Main mode: nothing left; the worktree can be released.

## Rules

- Never archive with open tasks or untouched listed docs (unless the user explicitly overrides, and then say what was skipped in the commit message).
- Never edit the archived `tasks.md` by hand. Do not delete the branch or worktree yourself.
- Idempotent: if the archived folder already exists and the active one does not, report "already archived" and only ensure the backlog task is done.
