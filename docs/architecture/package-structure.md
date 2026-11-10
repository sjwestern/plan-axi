---
title: Package structure
summary: How docs-axi and change-axi share section logic and where code lives
---

# Package structure

- `packages/docs-axi`: commands under `src/commands/`, pure section logic in `src/sections.ts`, raw-text edit in `src/sectionedit.ts`.
- `packages/change-axi`: imports docs-axi code as `docs-axi/lib/<module>` (no `.js` extension). Required sections in `src/spec.ts`, validation in `src/check.ts`, tasks-axi wrapper in `src/tasks.ts`.
- Shared TOML writing (`upsertKey`, `removeKey`, `removeTable`, `applyTomlEdit` with a validate callback) lives in `packages/docs-axi/src/tomlwrite.ts`; docs-axi `config` and change-axi `config` both use it via `docs-axi/lib/tomlwrite`. change-axi plan config read model is in `src/planconfig.ts`; validation is the pure checker in `src/configcheck.ts` (`checkFile` per file, `checkMerged` across user and repo files, located `{file, key, severity, message}` problems) shared by `config` writes and `config --verify`; the command is `src/configcmd.ts`.
- Build order matters: docs-axi first (the root `npm run build` does it).

## Docs layout

The docs layout (folder, ordered sections, ADR section) is resolved once in `packages/docs-axi/src/config.ts` from `.plan-axi.toml` and user config, and exposed as `loadConfig(root).layout`. `docsConfigProblems(root)` in the same file shares the layout rules but collects every problem with its file (used by change-axi `config --verify`); `loadConfig` still throws the first. docs-axi commands and change-axi (`archive` ADR detection, Docs impact, `Ctx.docsConfig`) use it; nothing else hard-codes folder names. The ADR section is a fixed kind (numbered, status, supersession); other sections are plain docs.

## Section model

A section is a `#`-`######` heading outside code fences and the lines under it. Own content ends at the next heading of any level; `--tree` extends to the next heading of the same or higher level. Refs are made unique by heading chain, then `#N`.
