# Improve docs-axi ADR discovery and search

## Why

Agents checking planned work against existing ADRs have no simple way to list or search only ADRs. They must know the ADR section name, and mixed search results only imply which rows are ADRs. Bare docs-axi dumps index rows instead of a summary. Search cannot require all terms and does not show how many terms matched.

## Context

Docs read: docs/domain/cli-quick-reference.md, docs/architecture/package-structure.md. ADRs: 0003 (section-level CLI access), 0009 (ADR section is a fixed type; layout is config). Code read: packages/docs-axi/src/commands/read.ts (home, list, search), src/commands/write.ts (adr create), src/cli.ts.

## What changes

- Bare docs-axi becomes a dashboard: total, counts per section, ADR counts by status, help hints. No index rows.
- docs-axi adr (bare) prints ADR counts by status and hints for list, search, add.
- docs-axi adr list [--status <s>|all] [--full] [--limit n]: all ADRs by default; schema number,title,status,summary; --full adds truncated decision text and superseded-by.
- docs-axi adr search <terms> [--all] [--full]: ranked search scoped to the ADR section, resolved from the layout.
- docs-axi adr add "<title>" ...: the old docs-axi adr "<title>" create. The old form errors with a hint.
- docs-axi search gains a matched N/M column and --all (require every term). Mixed list/search results mark ADRs explicitly.
- Unknown flags and subcommands fail loudly.

## Out of scope

- Status filter on generic list/search (ADR-only, lives in adr list).
- Stemming, phrase search, synonyms.
- Changing ADR numbering, templates, or the layout config.

## Approach

Extract list and search cores in read.ts that take an optional section and return scored docs; row formatters differ per caller. generic search/list keep path,title,summary plus an ADR marker; adr list/search use number,title,status,summary. adr subcommands are thin wrappers passing the ADR section from the layout. --all filters to docs where matched equals term count. Home reads counts only. Alternatives: --adr flag on search (rejected: weaker discoverability), status filter on search (rejected: only ADRs have status). ADR proposed for the adr subcommand shape.

## Steps

- `01-shared-list-search-core-with-matched-and.md`
- `02-dashboard-home.md`
- `03-adr-subcommands.md`
- `04-update-docs-and-skills.md`

## Acceptance

npm test passes. docs-axi shows a dashboard with no rows. docs-axi adr, adr list --status accepted, adr list --full, adr search <terms> --all work. docs-axi search a b --all returns only docs with both. Old docs-axi adr "t" errors with hint. docs-axi check passes.

## Docs impact

- docs/domain/cli-quick-reference.md - update: adr subcommands, search --all and matched, dashboard home.
- docs/decisions/0011-adrs-are-read-through-the-adr-subcommand.md - create: ADR (proposed).
- skills/plan-propose/SKILL.md, skills/plan-explore/SKILL.md - update: new adr commands.

## Risks and open questions

- Breaking change to docs-axi adr "<title>"; any external scripts break (loud error with hint).
- matched column adds tokens per search row; acceptable at default limit 10.
- Whether ADR marker is a kind column or ADR-NNNN in status is decided in step 01.
