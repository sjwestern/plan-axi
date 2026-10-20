# Guard against ADR number clashes

## Why

Two checkouts can each create the next ADR number before either lands, so git merges both files cleanly and the repo ends up with two ADRs sharing one number. Plans and docs reference ADRs by bare number, so a clash silently points at two documents, and fixing one means hand-editing prose. Nothing checks for duplicates at commit-plan or finish.

## Context

Docs read: docs/architecture/package-structure.md (change-axi imports docs-axi/lib), ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded is the proposed ADR written with this plan, ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type, docs/domain/cli-quick-reference.md. Code read: docs-axi src/model.ts (nextAdrNumber), src/commands/check.ts (ADR_DUPLICATE_NUMBER exists), change-axi src/commitplan.ts, finish.ts, check.ts. Apply change:improve-docs-axi-adr-discovery first: it adds the docs-axi adr subcommand router that renumber hangs off.

## What changes

- ADR references in plans, steps and docs use one full form: ADR-NNNN-slug (for example ADR-0011-adrs-are-read-through-the-adr-subcommand). Bare numbers (`ADR 7`, `ADR 0007`) are errors.
- docs-axi check and change-axi check report ADR refs that do not resolve (number and slug must both match) and bare refs.
- docs-axi adr renumber <ref|path> [--to <n>] renames the ADR file, rewrites its number, rewrites every ADR-NNNN-slug ref in the docs dir, active plans and archived changes (changes may reference docs), and regenerates the index.
- Next free number = highest across the working tree, the local default branch and its remote-tracking ref (origin/<default>, no network), plus 1. Gaps are never filled. --to is rejected if the number is taken in any of those.
- commit-plan and finish fail on duplicate ADR numbers, on an ADR number already used by a different file on the default branch (local or origin/<default>), and on unresolved or bare refs. The error names the files, says which one is not on the default branch, and gives at most two commands: the renumber command, then the retry. It adds a `git pull --rebase` hint only when the local default branch is behind origin/<default>.
- docs-axi adr fix-refs [--dry-run] is the required one-time migration for existing repos. It rewrites bare and stale refs to ADR-NNNN-slug in docs, active changes and archived changes, lists ambiguous ones without guessing, and reports docs that reference changes (docs must not; changes may reference docs). No soft rollout: checks and guards fail until it has been run.
- This repo is migrated by running it.

## Out of scope

- Assigning numbers late or slug-only ADRs.
- Network fetch. A number held only on an unfetched remote or another feature branch cannot be seen; renumber --to lets a user pre-empt it, and the guard catches the clash once that ADR reaches the default branch.
- Auto-renumbering without being asked.

## Approach

fix-refs reuses the same parser and resolves by number, then slug. Add src/adrrefs.ts in docs-axi (docs-axi/lib/adrrefs): regex ADR-(\d{4})-([a-z0-9-]+); find refs outside code fences, resolve against loaded ADRs, detect bare refs. docs-axi check and change-axi check use it. renumber resolves the ADR, picks the number (--to or next free across tree, local default and origin/<default>), renames the file, replaces the exact token in docs, active and archived plans, regenerates the index. Guards share one adrguard function in change-axi used by commit-plan and finish. The fix path stays at renumber plus retry; pulling or rebasing is hinted only when the local default branch is behind origin. Alternatives: slug-only refs (bigger change), fetch-based prevention (does not fix a clash). Decision recorded in ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded.

## Steps

- `01-adr-ref-parsing-and-checks.md`
- `02-adr-renumber-command.md`
- `03-guard-commit-plan-and-finish.md`
- `04-migrate-refs-docs-and-skills.md`
- `05-adr-fix-refs.md` - docs-axi adr fix-refs migration command

## Acceptance

npm test passes. With two ADRs numbered 0012, docs-axi check reports the clash; commit-plan and finish fail and print the renumber command; after docs-axi adr renumber the refs resolve and the commands succeed. Bare ADR refs are rejected.

## Docs impact

- `docs/decisions/0012-adr-references-carry-number-and-slug-and-clashes-are-guarded.md` - create: ADR (proposed).
- `docs/domain/cli-quick-reference.md` - update: adr renumber, ref form, guard errors.
- `docs/domain/glossary.md` - update: ADR reference.
- `skills/plan-propose/SKILL.md`, `skills/plan-explore/SKILL.md` - update: full ref form, clash fix.

## Risks and open questions

- Step 02 and the router in change:improve-docs-axi-adr-discovery both edit docs-axi cli.ts; apply that change first.
- Step 04 edits other active plans; do it when those plans are not mid-apply, or coordinate.
- Which side to renumber when neither is on the default branch: the guard suggests the one not in HEAD.
