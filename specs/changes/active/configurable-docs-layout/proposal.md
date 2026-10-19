# Configurable docs layout: sections, ADR section, docs dir, change references

## Why

Repos have their own doc layouts (guides/, reference/, rfcs/), but docs-axi hard-codes domain, architecture and decisions. Agents also get the meaning of each folder only from text baked into skills, so a different layout cannot be described to them. Separately, `change-axi archive` hard-codes `docs` and `docs/decisions`, so a non-default layout breaks ADR acceptance and staging, and references between changes use paths that archive moves.

## Context

- Docs read: `architecture/package-structure.md`, `architecture/plan-workflow.md`, `domain/cli-quick-reference.md`, `domain/glossary.md`.
- ADRs: 2 (docs edited in place, archived changes are history), 3 (agents read and write docs by section through the CLI), 6 (config-driven behavior via `.plan-axi.toml`).
- Code: `packages/docs-axi/src/{config,model,indexgen}.ts`, `commands/{read,write,check,migrate}.ts`; `packages/change-axi/src/{archive,start,spec,setup,change}.ts`.
- Uncommitted prior work adds `SECTION_GUIDE` in `docs-axi/src/model.ts` (one source for section meanings). Commit it before applying; step 01 replaces it with the config-driven layout.

## What changes

- `.plan-axi.toml` `[docs]` gains `dir`, `sections` (ordered list), `adr` (the one ADR section name, or `false`), and `[docs.section.<name>] guide`. Omitted = today's defaults (docs, domain/architecture/decisions, adr = decisions). Repo config wins over user config for these keys; `ignore` and `map` still union.
- Every configured section must have a guide. Missing guide is a config error. Default names have built-in guides. Names are lowercase slugs, unique, not `other`; `adr` must be a configured section.
- The ADR section keeps its own rules (NNNN-slug.md, numbering, status, adr/update/supersede/check). Without one, ADR commands error with a hint. Other sections are plain docs.
- `[docs.map.<section>]` accepts any configured section.
- `docs-axi config` prints the resolved layout (docs dir, sections with guide and type, sources). With flags (`--dir`, `--sections`, `--adr`, `--guide name="..."`) it writes the repo `.plan-axi.toml`, editing only the `[docs]` keys it owns. `init` follows the layout.
- `docs-axi migrate` validates sections against the layout and suggests by path segment, ADR-dir patterns, then keep/ignore. Unmatched files need a section before `--apply`.
- Files under folders that are no longer sections show as UNMANAGED and are never moved automatically; `migrate` is the explicit way.
- change-axi uses the resolved docs dir and ADR section (archive ADR detection and index, staging, dirty checks, Docs impact guide). This fixes the hard-coded `docs` and `docs/decisions` in archive and start.
- Changes reference other changes by slug (`change:<slug>`), resolved through `change-axi where <slug>` and `show`/`status`/`sections` for active and archived changes. `change-axi check` errors on an unknown `change:<slug>` and warns on `specs/changes/` paths inside a change. Docs and ADRs stand alone: `docs-axi check` warns (`DOC_LINKS_TO_CHANGE`) on any link, path or `change:<slug>` from a doc to a change, with no slug validation and no change-awareness in docs-axi.
- Skills and the setup block no longer name docs folders; they run `docs-axi config` for the layout. A repo test fails if a skill or `setup.ts` hard-codes `docs/domain`, `docs/architecture` or `docs/decisions`.

## Out of scope

- Automatic moves when the layout changes.
- Changing ADR file naming or ADR rules.
- Section-specific templates beyond the existing doc and ADR templates.
- Rewriting existing path references when archiving (slug references replace them; archive only reports paths it finds).
- Config keys for user-level sections beyond repo-wins merging.

## Approach

Config loader builds a resolved `Layout` (`dir`, ordered `sections` with `guide` and `kind: doc|adr`, `adr`) on `Ctx`, validated at load, defaults when unset. Section lists and `=== "decisions"` checks in docs-axi become layout lookups. change-axi reads the layout through `docs-axi/lib/config` (already shared, as `loadRawConfig` is used for the agent). `docs-axi config` is the single stable command skills call; the home view's `sections` block comes from the same layout. The config writer is a line-based upsert of `[docs]` keys and `[docs.section.*]` tables so comments and other tables survive.
Alternatives: rename-only aliases (does not fix "different kinds of docs"); fully free section kinds (more general, more work; one designated ADR section covers the real need); rewriting paths on archive (slug references remove the need).
Decision to record as an ADR: layout is config, ADR stays a fixed type with a configurable folder, and skills read the layout from the CLI.

## Steps

- `01-layout-config-and-validation.md` - resolved Layout with defaults and validation.
- `02-docs-axi-commands-use-the-layout.md` - read, write, check, index, init use it.
- `03-migrate-honors-the-layout.md` - migrate suggests and validates by layout.
- `04-docs-axi-config-command-and-init-flags.md` - `docs-axi config` print and write.
- `05-change-axi-uses-the-resolved-layout.md` - archive, start, spec use dir and ADR section.
- `06-change-references-by-slug.md` - `change:<slug>`, `where`, check rules, archive report.
- `07-skills-and-setup-read-the-layout-from-th.md` - skills and setup read `docs-axi config`; no hard-coding test.
- `08-docs-and-adr.md` - README, reference docs, ADR.

## Acceptance

- `npm test` passes; default-layout outputs are unchanged.
- In a scratch repo with `.plan-axi.toml` `dir=documentation`, `sections=[guides,reference,rfcs]`, `adr=rfcs` and guides: init, new, adr, check, migrate, and `change-axi archive` (accepting an ADR) all use those names.
- A section with no guide fails config load with a clear message.
- `docs-axi config` prints the layout; skills contain no hard-coded section folders (test enforces).
- Archiving a change leaves slug references valid; `change-axi where <slug>` resolves active and archived changes.

## Docs impact

- `README.md` - update: Config section and layout line.
- `docs/domain/cli-quick-reference.md` - update: `config`, `where`, `change:<slug>`.
- `docs/architecture/package-structure.md` - update: layout resolution shared by both packages.
- `docs/decisions/0009-docs-layout-is-config-adr-section-stays-a-fixed-type.md` - create: ADR (number assigned by `docs-axi adr`).
- `docs/README.md` - update: regenerated index.

## Risks and open questions

- Config writer must preserve user comments and other tables; mitigated by editing only owned keys and validating before write.
- Changing sections on an existing repo leaves old folders UNMANAGED until `migrate`; documented, not automated.
- Steps 05 and 06 both own `archive.ts`, so 06 is chained after 05; 06 also owns docs-axi `check.ts` after step 02.
- Uncommitted `SECTION_GUIDE` work must be committed before applying.
