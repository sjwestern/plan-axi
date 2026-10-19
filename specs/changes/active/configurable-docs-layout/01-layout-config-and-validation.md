# 01 - Layout config and validation

Owns: packages/docs-axi/src/config.ts, packages/docs-axi/src/model.ts, packages/docs-axi/test/config.test.ts
Docs: architecture/package-structure.md

## Goal

Resolve and validate a docs layout from config, with today's defaults when nothing is set.

## Context

Config parser (`config.ts`) is a flat-key TOML subset: tables, strings, string arrays, booleans. Keys arrive as `docs.section.<name>.guide`. Replaces the uncommitted `SECTION_GUIDE`/`SECTIONS` constants in `model.ts` (keep them as the built-in defaults). change-axi reads config via `docs-axi/lib/config`. Repo config wins over user for dir, sections, adr, guides; ignore and map still union.

## Work

1. `config.ts`: parse `docs.dir`, `docs.sections`, `docs.adr` (string or false), `docs.section.<name>.guide`.
2. Add `Layout { dir, sections: {name, guide, kind: 'doc'|'adr'}[], adr?: string }` to `DocsConfig`; defaults: docs, domain/architecture/decisions with built-in guides, adr=decisions.
3. Validate at load, `VALIDATION_ERROR` naming the key and file: names are lowercase slugs, unique, not `other`; every section has a guide (built-in for default names); `adr` names a configured section or is false; `adr` defaults to decisions only when it is in sections.
4. `model.ts`: replace `SECTIONS`/`isSection`/`isDocSection` with functions taking the layout; `Ctx.docsDir` comes from `layout.dir` unless `--docs` overrides. `sectionOf` uses the layout.
5. Export the layout loader for change-axi.

## Done when

`npm test` passes. Tests: no config gives today's layout exactly; custom sections+adr+guides resolve; missing guide, duplicate, `other`, bad adr and bad slug each error with a clear message; repo overrides user; `[docs.map.<custom>]` accepted.
