---
name: plan-migrate-docs
description: Migrate an existing repo docs folder into the standard layout (docs/domain, docs/architecture, docs/decisions) with frontmatter and a generated index, using docs-axi migrate. Use when docs-axi check reports many UNMANAGED or NO_FRONTMATTER items, or the user asks to adopt the docs layout. Separate from plan work - never bundle with a feature plan.
---

# Migrate docs

A one-off, human-approved cleanup. Run it on its own branch/commit, not inside a feature plan.

## Steps

1. **Preflight.** Git tree clean for `docs/` (commit or stash first). `docs-axi` on PATH (else stop and tell the user to install it). Run `docs-axi check` and note the baseline.
2. **Config first.** Planning/delivery folders (`todo/`, `plans/`, `reports/`, `.agents`-style tool content) are not docs. Add them to `[docs] ignore` in the repo's `.plan-axi.toml` (the dry run suggests a line). Ask the user before writing it.
3. **Propose.** `docs-axi migrate --plan migration.json` (dry run; writes only the JSON, and only if the file does not exist yet - an existing plan is never overwritten, `--force` regenerates it). Read the table.
4. **Review and fix the proposal** (edit `migration.json`, not the docs):
   - `section` is a filename heuristic. Read each file's opening and correct it (domain = what/why in user terms; architecture = how it is built; decisions = one decision per file; a file holding many decisions is a domain or architecture doc, not an ADR).
   - `summary` is only the doc's first sentence. **Read each flagged doc and write a real one-line description** (what it covers, when to read it, max 160 chars). Never reuse the title, a `Status:`/`Note:` lead-in, or one sentence across several docs. The dry run's `summary` column names every weak one and `--apply` refuses until they are fixed. Do not use `--allow-weak-summaries` unless the user says so.
   - Set `action: ignore` for anything that is not durable reference.
   - Split or merge docs only after the migration, as separate edits.
   Re-run `docs-axi migrate --plan migration.json` to validate your edits (it shows the edited plan, does not modify it). Show the user the final table and wait for approval.
5. **Apply.** `docs-axi migrate --apply --plan migration.json`. It `git mv`s, adds missing frontmatter (keeps existing values), rewrites relative links between docs, regenerates the index.
6. **Fix outside references.** The result lists `references_outside_docs` (AGENTS.md, CI, code, skills). Edit each to the new path. These are not rewritten automatically.
7. **Verify.** `docs-axi check` (no errors; read warnings - broken links in docs outside the layout are reported there; fixing them is a separate edit, ask the user), `git status`, spot-check 2-3 moved docs and their links. Delete `migration.json`. Leave the commit to the user. If asked to commit: `git mv` leaves renames staged and other edits (outside references, `.plan-axi.toml`) unstaged, so stage explicitly by name and group as: moves + config, outside-reference fixes, any doc-body fixes (dead links etc.).

## Rules

- Never apply without user approval of the reviewed proposal.
- Do not edit doc bodies during migration beyond what the tool does.
- Do not touch `.agents/`, `.pi/`, `.claude/` or other tool-owned folders.
