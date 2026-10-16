---
title: Package structure
summary: How docs-axi and change-axi share section logic and where code lives
---

# Package structure

- `packages/docs-axi`: commands under `src/commands/`, pure section logic in `src/sections.ts`, raw-text edit in `src/sectionedit.ts`.
- `packages/change-axi`: imports docs-axi code as `docs-axi/lib/<module>` (no `.js` extension). Required sections in `src/spec.ts`, validation in `src/check.ts`, tasks-axi wrapper in `src/tasks.ts`.
- Build order matters: docs-axi first (the root `npm run build` does it).

## Section model

A section is a `#`-`######` heading outside code fences and the lines under it. Own content ends at the next heading of any level; `--tree` extends to the next heading of the same or higher level. Refs are made unique by heading chain, then `#N`.
