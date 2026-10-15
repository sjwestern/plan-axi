# <Title: what changes, in a few words>

## Context

Docs read for this plan (paths, from `docs-axi`) and ADRs that apply (by number).
Write "no relevant docs found" if the area is undocumented.

- docs/...

## Why

The problem or goal, and who it matters to. 2-5 sentences.

## What changes

Observable behavior or structure after this change. Bullets, concrete.

## Out of scope

What this change deliberately does not do.

## Approach

How it will be built, at the level a reviewer can judge. Name key components and boundaries.
Alternatives considered and why they lost (one line each). Any real decision becomes an ADR (see Docs impact).

## Steps

One line per step file, in reading order. Dependencies live in `tasks.md` (tasks-axi), not here.

- `01-<name>.md` - what this step delivers
- `02-<name>.md` - ...

## Acceptance

How we know the whole change works: commands to run, behaviors to observe. Checkable, not vague.

## Docs impact

Every doc that is created or changes as part of this change, one line each.
Use `None - <reason>` only when no doc is affected.

- `docs/domain/<file>.md` - update: <what changes>
- `docs/architecture/<file>.md` - new: <what it covers>
- `docs/decisions/NNNN-<slug>.md` - new ADR (proposed): <decision>

## Risks and open questions

- ...
