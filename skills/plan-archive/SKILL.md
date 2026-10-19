---
name: plan-archive
description: Finish a change. Verifies every task is done and docs are updated, accepts the change's ADRs, moves specs/changes/active/<slug> to specs/changes/archived/YYYY-MM-DD-<slug>, and marks the change done in the repo backlog. Works on the feature branch (preferred) or on main after the branch is merged. Use when the user says "archive", "finish the change", or "close out <slug>".
---

# Archive

Close a completed change. The archive is history only: current truth lives in the docs (`docs-axi config` shows where).

## Conventions

- Active: `specs/changes/active/<slug>/`. Archived: `specs/changes/archived/<YYYY-MM-DD>-<slug>/` with the whole folder (including `tasks.md`, all tasks Done).
- Task files change only through `tasks-axi ... --file`, from the repo root. `npx -y tasks-axi@0.2.6` only if `tasks-axi` is "command not found". `docs-axi` is called directly.
- `change-axi` (call the binary on PATH; if "command not found", stop and tell the user to install it with `npm run build && npm link`) does the mechanics; the date is the local date.

## Where to run

- **On the feature branch (preferred).** The branch carries the final state; archive is its last commit, so one merge brings code, docs, history and backlog together.
- **On main, after merge** (branch `<slug>` merged, `specs/changes/active/<slug>/` still present).
- Anywhere else -> `change-axi archive` refuses and says why.

## Steps

1. **Dry run.** `change-axi archive <slug> --dry-run`. It checks: clean tree for `specs docs backlog.md`, all tasks done, plan check, every doc in Docs impact exists and changed since the plan commit (ADRs exempt), and lists the ADRs it would accept. Fix what it reports. Untouched docs: update them; only if the user explicitly agrees, pass `--skip-docs-check` and say why in the commit message.
2. **Judge the ADRs.** For each ADR listed as `accept`, check the decision matches what was built (`docs-axi show <n> --section Decision`). If one no longer matches, fix it with `docs-axi write` first, or ask the user. If an ADR replaces an earlier one, run `docs-axi supersede <old> --by <new>` before step 3.
3. **Archive.** `change-axi archive <slug> --commit`. It accepts the proposed ADRs (and reindexes), `git mv`s the folder to `archived/<date>-<slug>`, marks the backlog task done, and commits `archive <slug>`.
4. **Report**: archived path, ADRs accepted, docs changed. Branch mode: tell the user to run this from the main checkout:

   ```sh
   change-axi finish <slug>
   ```

   It skips archiving when already done, fast-forward merges `<slug>` into main and releases the worktree. Main mode: nothing left; the worktree can be released.

## Finish in one step

From the main checkout, `change-axi finish <slug>` archives on the branch if needed (same checks as `archive`), merges, and returns the worktree. Use `change-axi finish <slug> --dry-run` to review the ADRs it would accept. For a review gate, run steps 1-3 on the branch first, then `finish`. Add `--delete-branch` to also remove the merged branch (`git branch -d`) after the worktree is returned.

## Rules

- Never archive with open tasks or untouched listed docs (unless the user explicitly overrides, and then say what was skipped in the commit message).
- Never edit the archived `tasks.md` by hand. Do not delete the branch or worktree yourself.
- Idempotent: an already archived change only ensures the backlog task is done.
- Copyable commands: put every command the user may paste in its own fenced code block, one command per line, after the sentence that introduces it. Never end a prose sentence with a command and never split one across lines; for long ones use a short form, a variable, or a script.
