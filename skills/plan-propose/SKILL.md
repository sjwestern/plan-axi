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
- Repo-level `backlog.md` holds one task per change, id = slug. `change-axi new` queues it. Unplanned items (kind idea, bug, chore) come from `change-axi idea "<one-liner>"` and are listed by `change-axi backlog`; `kind: change` always means a plan folder exists.

## Steps

1. **Read docs first.** `docs-axi` (map), `docs-axi search <terms>`, `docs-axi adr search <terms> --all` (existing ADRs on the topic), `docs-axi show <path> [--section <name>]` for relevant docs and ADRs. If `docs-axi` is "command not found", stop and tell the user to install it. Re-read if the scope changed.
2. **Slug.** Kebab-case, verb first, max 50 chars; must be unused (active, archived, or a planned item in the backlog). First check `change-axi backlog`: if the work is an unplanned item, use its slug (or a better one with `--from`). `change-axi new` rejects collisions. Stop and ask on one. To revise an existing active plan, skip to "Revising a plan".
3. **Scaffold.** `change-axi new <slug> "<title>"`. For an unplanned item: `change-axi new <slug>` adopts it in place (the title is optional and the item body seeds Why), or `change-axi new <new-slug> --from <old-slug>` adopts it under a new slug, carrying title, body, priority, repo and blocked-by links and removing the old item. It writes `proposal.md` with every required section empty, ensures `.tasks.toml`, and queues the change in `backlog.md`.
4. **Fill the proposal**, one section at a time: `change-axi write <slug> proposal --section "<name>"` with the body on stdin. "Context" lists the docs actually read and ADRs that apply. **Docs impact** names every doc created or updated, or `None - <reason>`. `change-axi sections <slug> proposal` shows which are still empty.
5. **Add steps.** For each: `change-axi step add <slug> "<title>" --owns <paths> [--docs <docs>] [--after <ids>]`. It numbers the step, creates the file with empty sections, and creates the task with its `Spec:` link. Then fill Goal, Context, Work, Done when with `change-axi write <slug> <step> --section "<name>"`. Run `change-axi guidance` once first (it shows each tier's model; `change-axi config` with no flags shows the full setup, and `change-axi config --profile ... --tier ...` sets models). If it lists tier rules, pick for each step the tier whose rules match its work (several match: the higher tier; none: the `default_tier` or no tier), pass `--tier <small|standard|deep>`, and put a one-line reason in the step's Context. With no guidance, skip tiers. Split a step if it needs two unrelated `Owns`. Add a final docs step (its `Owns` are the docs files) when Docs impact is not `None`. Add `--after` only for real dependencies; chaining independent steps removes parallelism. Later changes: `change-axi dep <slug> <step> --on|--off <ids>` (cycles are reverted).
6. **List the steps** in the proposal: `change-axi write <slug> proposal --section Steps`, one line per step.
7. **Docs scaffolding.** Run `docs-axi config` and pick the section by its guide. For each new doc or ADR in Docs impact: `docs-axi new <section> "<title>" --summary "<one line>" [--body-file -]` or `docs-axi adr add "<title>" --summary "<one line>" --context "..." --decision "..." --consequences "..."` (status proposed; the flags fill the template sections in one call). Fill other docs section by section with `docs-axi write <doc> --section ... --add`. Do not pass a whole body to `adr add`: it replaces the template headings. Never choose ADR numbers by hand. Always cite ADRs in full form `ADR-NNNN-slug` (bare `ADR 7` fails `change-axi check`); on an ADR clash error run the printed `docs-axi adr renumber <ref>` command and retry.
8. **Validate.** `change-axi check <slug> --waves` and `docs-axi check`. Fix every error (missing/empty sections, cycles, orphan steps, slug reuse). Read the OVERLAP warnings: chain the steps with `change-axi dep` or narrow their `Owns`.
9. **Report.** Show: the slug, the step list with the waves (what can run in parallel), which steps got which tier and why, docs impact, open questions. Tell the user to review the diff (`git diff` / `git status`), then run `change-axi commit-plan` on main (the slug is auto-detected when only one plan is uncommitted; pass `<slug>` otherwise). It commits as `docs(plan): propose <slug>` with a `Change` trailer. Apply refuses to start until the plan is committed.

## Deprioritize or decide not to do

- Deprioritize: leave the item queued and lower its priority with `tasks-axi update <slug> --priority <0-4> --file backlog.md`. No plan needed.
- Decided not to do: record an accepted ADR titled "Do not X" (`docs-axi adr add ...` then `docs-axi update <n> --status accepted`), remove the item with `tasks-axi rm <slug> --file backlog.md`, and delete any plan folder for it. Do not commit; the human reviews.

## Revising a plan (review feedback, scope change)

- Cheat-sheet: `printf '<text>' | change-axi append <slug> <proposal|step-id> --section "<name>"` (section is a flag, not a positional; body via stdin, `--body` or `--body-file`).
- Edit one section: `change-axi write <slug> <proposal|step> --section "<name>"`. Add to a list: `change-axi append`. Add a missing section: `--add` (not needed for `append`, which creates it).
- Change order: `change-axi dep <slug> <step> --on|--off <ids>`. Add a step: `change-axi step add`. Edit Owns/Docs/Tier/title: `change-axi step set`.
- Remove a step: delete the file, then `tasks-axi rm <id> --file specs/changes/active/<slug>/tasks.md` (fails while other tasks depend on it; `dep --off` first).
- Re-run Validate (step 8) and re-check Docs impact against the current docs.

## Rules

- Multi-repo: when the change edits repos besides this one, set the `Repos:` header with `change-axi proposal set <slug> --repos name@base,name` (or `change-axi new <slug> --repos ...`; never hand-edit) (base optional, default branch otherwise; each name needs `[repos.<name>]` in `.plan-axi.toml`). Prefix `Owns:` entries for those repos with `<repo>:`; unprefixed entries belong to the plan repo. `change-axi check` errors on a prefix not in `Repos:`.
- `Owns:` = files the step will **edit** (the write set used for parallel-overlap checks). Files it only reads go in `Docs:` or Context, never `Owns:`.
- Tool-owned dirs (`.agents/`, `.pi/`, `.claude/`, ...) may be in `Owns:` only when the user asked for that change and `proposal.md` names the path; otherwise `check` errors (`OWNS_TOOL_DIR`).
- Docs outside the configured layout (`docs-axi config`): do not move or restructure them as part of a plan. Reference them by their real path. If `docs-axi list other` shows many docs outside the layout, recommend a separate migration (`plan-migrate-docs` skill) before or after this change, and keep it out of this plan's steps.
- Refer to other changes as `change:<slug>` (resolve with `change-axi where <slug>`), never by path; `change-axi check` errors on an unknown slug. Docs and ADRs never reference changes: put what the reader needs in the doc itself (provenance can be a plain sentence, not a link).
- Never hand-edit `tasks.md`. Never implement code. Never commit.
- Keep plans small: if there are more than ~8 steps, propose splitting into two changes.
- Copyable commands: put every command the user may paste in its own fenced code block, one command per line, after the sentence that introduces it. Never end a prose sentence with a command and never split one across lines; for long ones use a short form, a variable, or a script.
