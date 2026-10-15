---
name: plan-propose
description: Turn an explored idea into a change plan in specs/changes/active/<slug>/ - proposal.md, step files, and a tasks-axi dependency graph - plus a queued entry in the repo backlog. Use when the user says "propose", "write up the plan", or asks to create or revise a change proposal. Does not commit and does not implement.
---

# Propose

Materialize the draft (from `plan-explore` or the user's description) as a reviewable plan. Run on the main branch. **Do not commit** and **do not implement**: the human reviews the diff, then commits on main.

## Conventions

- Plan folder: `specs/changes/active/<slug>/` containing `proposal.md`, step files `NN-<name>.md`, and `tasks.md`.
- **`tasks.md` is owned by tasks-axi.** Never edit it by hand; only run `tasks-axi ... --file specs/changes/active/<slug>/tasks.md`. (Flags go after the command.) If `tasks-axi` is missing: `npx -y tasks-axi@0.2.6 <args>`.
- Repo-level `backlog.md` (tasks-axi default file) holds one task per change, id = slug.
- Task id = step file stem (`01-schema` for `01-schema.md`). Numbers are reading order only; the dependency graph is the real order.
- Each step task body is exactly `Spec: <file>.md` (path relative to the change folder).
- tasks-axi reads `.tasks.toml` from the **current directory** (run it from the repo root) and moves done tasks beyond `done_keep` (default 10) into `done-archive.md` beside the task file. Make sure the repo root has `.tasks.toml` with `[markdown]` / `done_keep = 1000` so a change's history stays in its own `tasks.md`. Create it if missing. Always pass `--file` so ambient config (`TASKS_AXI_FILE`, `~/.tasks-axi/config.toml`) cannot redirect writes.
- Templates: `templates/proposal.md` and `templates/step.md` in this skill's directory.

## Steps

1. **Read docs first.** `docs-axi` (map), `docs-axi search <terms>`, `docs-axi show <path>` for relevant docs and ADRs. If `docs-axi` is missing: `npx -y docs-axi@0.1.0 <args>`. Re-read if the scope changed.
2. **Slug.** Kebab-case, verb first, max 50 chars. It must not exist in `specs/changes/active/` or `specs/changes/archived/*-<slug>` (the archive prefix is a date). Stop and ask on a collision. `check-plan.mjs` enforces it (`SLUG_ARCHIVED`, `SLUG_DONE`) because `tasks-axi add` on an existing id is a silent no-op, so a reused slug would look finished. If revising an existing active plan, edit in place instead of creating.
3. **Write `proposal.md`** from the template. Fill every section; "Context" lists the docs actually read and ADRs that apply. **Docs impact** names every doc that will be created or updated, or `None - <reason>`.
4. **Write one step file per step** from the template. Each has `Owns:` (repo-relative paths/globs it edits), `Docs:`, Goal, Context, Work, Done when. Split a step if it needs two unrelated `Owns`. Add a final docs step (its `Owns:` are the docs files) when Docs impact is not `None`; it depends on the steps that change what it describes.
5. **Docs scaffolding.** For each new doc or ADR listed in Docs impact: `docs-axi new <section> "<title>" --summary "<one line>"` or `docs-axi adr "<title>" --summary "<one line>"` (status proposed). Fill in the content you already know (decision, context). Never choose ADR numbers by hand.
6. **Create tasks.** For each step, in dependency order (blockers first):
   `tasks-axi add <NN-name> "<title>" --file specs/changes/active/<slug>/tasks.md --body "Spec: <NN-name>.md" --blocked-by <id> [--blocked-by <id>]`
   - Add `--blocked-by` only for real dependencies. Do not chain independent steps; that removes parallelism.
   - The blocker must already exist, which is why order matters.
7. **Change-level task.** `tasks-axi add <slug> "<title>" --kind change --file backlog.md` (queued). Skip if it already exists. If `--file backlog.md` is the default file in this repo, omit `--file`.
8. **Validate.** `node <this skill>/scripts/check-plan.mjs <slug> --waves` and `docs-axi check`. Fix every error. tasks-axi **accepts dependency cycles silently**; this script is what catches them. Read the OVERLAP warnings: either chain the steps (`tasks-axi block <id> --by <other> --file ...`) or narrow their `Owns`.
9. **Report.** Show: the slug, the step list with the waves (what can run in parallel), docs impact, open questions. Tell the user to review the diff (`git diff` / `git status`), then commit on main. Apply refuses to start until the plan is committed.

## Revising a plan (review feedback, scope change)

Edit `proposal.md` and step files directly. For the dependency graph use only tasks-axi:

- Change order: `tasks-axi unblock <id> --by <other> --file ...` and `tasks-axi block <id> --by <other> --file ...`. Edit one edge at a time and re-run `check-plan.mjs` after (cycles are not rejected).
- Add a step: new step file + `tasks-axi add`. Remove a step: delete the file, then `tasks-axi rm <id> --file ...` (fails while other tasks still depend on it; unblock them first).
- Retitle or re-point: `tasks-axi update <id> --title "..." --body "Spec: ..." --file ...`.
- Re-run Validate (step 8) and re-check Docs impact against the current docs.

## Rules

- `Owns:` = files the step will **edit** (the write set, used for parallel-overlap checks). Files it only reads go in `Docs:` or Context, never `Owns:`.
- Tool-owned dirs (`.agents/`, `.pi/`, `.claude/`, ...) may be in `Owns:` only when the user asked for that change and `proposal.md` names the path; otherwise the checker errors (`OWNS_TOOL_DIR`).
- Docs outside `docs/{domain,architecture,decisions}`: do not move or restructure them as part of a plan. Reference them by their real path. If `docs-axi list other` shows many docs outside the layout, recommend a separate migration (`plan-migrate-docs` skill, or `docs-axi migrate`) to the user before or after this change, and keep it out of this plan's steps.
- Never hand-edit `tasks.md`. Never implement code. Never commit.
- Every step file must have a task, and every task a `Spec:` file that exists.
- Keep plans small: if there are more than ~8 steps, propose splitting into two changes.
