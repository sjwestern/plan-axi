---
name: plan-propose
description: Turn an explored idea into a change plan in specs/changes/active/<slug>/ - proposal.md, step files, and a tasks-axi dependency graph - plus a queued entry in the repo backlog. Use when the user says "propose", "write up the plan", or asks to create or revise a change proposal. Does not commit and does not implement.
---

# Propose

Materialize the draft (from `plan-explore` or the user's description) as a reviewable plan. Run on the main branch. **Do not commit** and **do not implement**: the human reviews the diff, then commits on main.

## Conventions

- Plan folder: `specs/changes/active/<slug>/` containing `proposal.md`, step files `NN-<name>.md`, and `tasks.md`.
- **Use `change-axi` for everything in the plan folder.** It creates the folder and files, owns the required section list, writes single sections, and manages tasks. Never create plan files by hand, never edit `tasks.md` (owned by tasks-axi), never read a whole file just to change one section. If `change-axi` is "command not found", stop and tell the user to install it (`npm run build && npm link`).
- Run from the repo root. `change-axi spec proposal|step` prints the required sections and what each must contain; do not memorize them.
- Body text goes in on stdin (`printf '...' | change-axi write ...`, or a heredoc), or `--body "..."`. Writes print a one-line result, never the body. `change-axi show <slug> <doc> --section <name>` reads one section.
- Task id = step file stem (`01-schema`). Numbers are reading order; the dependency graph is the real order.
- Repo-level `backlog.md` holds one task per change, id = slug. `change-axi new` queues it.

## Steps

1. **Read docs first.** `docs-axi` (map), `docs-axi search <terms>`, `docs-axi show <path> [--section <name>]` for relevant docs and ADRs. If `docs-axi` is "command not found", stop and tell the user to install it. Re-read if the scope changed.
2. **Slug.** Kebab-case, verb first, max 50 chars; must be unused (active, archived, backlog). `change-axi new` rejects collisions. Stop and ask on one. To revise an existing active plan, skip to "Revising a plan".
3. **Scaffold.** `change-axi new <slug> "<title>"`. It writes `proposal.md` with every required section empty, ensures `.tasks.toml`, and queues the change in `backlog.md`.
4. **Fill the proposal**, one section at a time: `change-axi write <slug> proposal --section "<name>"` with the body on stdin. "Context" lists the docs actually read and ADRs that apply. **Docs impact** names every doc created or updated, or `None - <reason>`. `change-axi sections <slug> proposal` shows which are still empty.
5. **Add steps.** For each: `change-axi step add <slug> "<title>" --owns <paths> [--docs <docs>] [--after <ids>]`. It numbers the step, creates the file with empty sections, and creates the task with its `Spec:` link. Then fill Goal, Context, Work, Done when with `change-axi write <slug> <step> --section "<name>"`. Split a step if it needs two unrelated `Owns`. Add a final docs step (its `Owns` are the docs files) when Docs impact is not `None`. Add `--after` only for real dependencies; chaining independent steps removes parallelism. Later changes: `change-axi dep <slug> <step> --on|--off <ids>` (cycles are reverted).
6. **List the steps** in the proposal: `change-axi write <slug> proposal --section Steps`, one line per step.
7. **Docs scaffolding.** For each new doc or ADR in Docs impact: `docs-axi new <section> "<title>" --summary "<one line>" [--body-file -]` or `docs-axi adr "<title>" --summary "<one line>" --context "..." --decision "..." --consequences "..."` (status proposed; the flags fill the template sections in one call). Fill other docs section by section with `docs-axi write <doc> --section ... --add`. Do not pass a whole body to `adr`: it replaces the template headings. Never choose ADR numbers by hand.
8. **Validate.** `change-axi check <slug> --waves` and `docs-axi check`. Fix every error (missing/empty sections, cycles, orphan steps, slug reuse). Read the OVERLAP warnings: chain the steps with `change-axi dep` or narrow their `Owns`.
9. **Report.** Show: the slug, the step list with the waves (what can run in parallel), docs impact, open questions. Tell the user to review the diff (`git diff` / `git status`), then commit on main. Apply refuses to start until the plan is committed.

## Revising a plan (review feedback, scope change)

- Edit one section: `change-axi write <slug> <proposal|step> --section "<name>"`. Add to a list: `change-axi append`. Add a missing section: `--add`.
- Change order: `change-axi dep <slug> <step> --on|--off <ids>`. Add a step: `change-axi step add`. Edit Owns/Docs/title: `change-axi step set`.
- Remove a step: delete the file, then `tasks-axi rm <id> --file specs/changes/active/<slug>/tasks.md` (fails while other tasks depend on it; `dep --off` first).
- Re-run Validate (step 8) and re-check Docs impact against the current docs.

## Rules

- `Owns:` = files the step will **edit** (the write set used for parallel-overlap checks). Files it only reads go in `Docs:` or Context, never `Owns:`.
- Tool-owned dirs (`.agents/`, `.pi/`, `.claude/`, ...) may be in `Owns:` only when the user asked for that change and `proposal.md` names the path; otherwise `check` errors (`OWNS_TOOL_DIR`).
- Docs outside `docs/{domain,architecture,decisions}`: do not move or restructure them as part of a plan. Reference them by their real path. If `docs-axi list other` shows many docs outside the layout, recommend a separate migration (`plan-migrate-docs` skill) before or after this change, and keep it out of this plan's steps.
- Never hand-edit `tasks.md`. Never implement code. Never commit.
- Keep plans small: if there are more than ~8 steps, propose splitting into two changes.
