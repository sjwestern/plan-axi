# 06 - Change references by slug

Owns: packages/change-axi/src/change.ts, packages/change-axi/src/check.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/where.ts, packages/change-axi/src/archive.ts, packages/docs-axi/src/commands/check.ts, packages/change-axi/test/refs.test.ts
Docs: none

## Goal

Changes refer to other changes by slug, resolved by tools, so archive no longer breaks references.

## Context

Archive moves `specs/changes/active/<slug>` to `archived/<date>-<slug>`. Slugs are unique across active, archived and backlog (`SLUG_ARCHIVED`). Today `requireChange` only looks in active. Docs must not link to changes; backlog references changes by slug already. Syntax decided: `change:<slug>`.

## Work

1. `change.ts`: resolver for a slug: active first, then `archived/<date>-<slug>`, else backlog-only. `show`, `status`, `sections` accept archived slugs read-only and label them in output.
2. New `change-axi where <slug>` (`where.ts`): prints path and state (active|archived|backlog only).
3. `check.ts`: `change:<slug>` matching no known slug is an error `UNKNOWN_CHANGE_REF`; a `specs/changes/…` path inside a change is a warning with a use-the-slug hint. `<placeholders>` ignored.
4. `archive.ts`: no rewriting. After the move, scan backlog.md and other changes for the old path and report them (and in `--dry-run`), plus matches outside (docs, code, CI).
5. `docs-axi` `check.ts`: warn `DOC_LINKS_TO_CHANGE` for any link, path, or `change:<slug>` in a doc (ADRs included) that points at `specs/changes/` or a change. No slug validation and no knowledge of changes beyond matching the `specs/changes/` path and the `change:` prefix. Hint: docs and ADRs stand alone; put what the reader needs in the doc or a linked doc (provenance can be a plain sentence, not a link). `<placeholder>` paths such as `specs/changes/active/<slug>/` are ignored.
6. Help text and the Context section guide mention `change:<slug>`.

## Done when

`npm test` passes. Tests: `where` finds active, archived and backlog-only; `show` reads an archived change; an unknown change ref errors; path in a change warns; archive reports (not edits) old-path references; docs-axi warns on an architecture doc and on an ADR that link a `specs/changes/` path or use `change:<slug>`, and does not flag this repo's `<slug>` placeholders.
