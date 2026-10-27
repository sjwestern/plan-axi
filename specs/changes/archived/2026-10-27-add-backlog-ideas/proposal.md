# Capture backlog ideas and promote them into changes

## Why

Agents capture work with `tasks-axi add`, but `change-axi new` rejects a slug already in the backlog, so a captured item cannot become a plan under its own id. The backlog also has no notion of work that is not planned yet, so `kind: change` is overloaded. People note ideas, bugs and chores to avoid forgetting them, then later list the backlog and want to explore and propose one.

## Context

Docs read: ADR-0001-task-state-and-dependencies-live-in-tasks-axi (state lives in tasks-axi; `tasks-axi add` on an existing id is a silent no-op, so slugs are checked for reuse), ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type, `docs/architecture/plan-workflow.md`, `docs/domain/glossary.md`, `docs/domain/cli-quick-reference.md`. ADR statuses are proposed|accepted|superseded|deprecated. Code: `newCommand` and `startCommand` in `packages/change-axi/src/commands.ts`, `resolveChange` and `backlogSlugs` in `change.ts`. Reference: firstmate uses free-text tasks-axi kinds (ship, scout, docs, captain) and a `future` hold for captured work; plan-axi uses a kind instead so ideas stay visible in `tasks-axi list --state queued`.
New ADR: ADR-0013-unplanned-backlog-items-use-their-own-kinds-and-are (proposed).

## What changes

- Kinds `idea`, `bug`, `chore` mark backlog items with no plan. `kind: change` always means a plan folder exists.
- `change-axi idea "<one-liner>" [--kind idea|bug|chore] [--slug <s>] [--body <text>] [--priority 0-4] [--repo <name>]` adds a queued item. Slug is derived from the title (verb first, kebab-case, max 50 chars, no random suffix) unless `--slug` is given. `--repo` lets one backlog track work for several repos.
- `change-axi backlog` lists unplanned items sorted by priority (0 highest) then age: slug, kind, priority, repo, title, plus a hint to propose.
- `change-axi new <slug> ["<title>"]` adopts an unplanned item with that slug: sets `kind: change`, keeps the backlog title when none is given, seeds the proposal Why from the item body. A `change` item still errors.
- `change-axi new <new-slug> --from <old-slug>` adopts under a new id: adds the new item with the same title, body, priority, repo and blocked-by links, then removes the old one. No duplicate remains.
- Slug checks use one shared function over every slug in scope for the CLI: active plans, archived plans, and every backlog item in any state (queued, in flight, done). `idea`, `new` and `new --from` all use it.
- `change-axi start` and `plan-apply` refuse unplanned items: "propose it first".
- `change-axi where` reports an unplanned item with its kind.
- Priority uses the tasks-axi field `--priority 0-4`, documented as P0-P4.
- Skills: `plan-explore` and `plan-propose` accept a backlog item (slug or title) and adopt it. Ready to propose = explore produced a draft with scope and acceptance criteria.
- Conventions: deprioritized work stays queued with a lower priority. Work decided against is recorded as an accepted ADR and the item is removed with `tasks-axi rm` (and the plan folder deleted if one exists).

## Out of scope

A `drop` or `cancel` command (archive requires all tasks done; abandoning a plan is rare, follow-up). Epics or grouping changes. Estimates and sprints. Changes to tasks-axi. A new ADR status.

## Approach

A thin layer over tasks-axi through the existing `runTasks` helper: `add --kind <k>`, `update --kind change`, `rm`. New module `src/backlog.ts` holds slug derivation, the shared slug-taken check, kind validation and the `idea`/`backlog` commands; `new` and `start` call into it. `resolveChange` keeps its `backlog` state but returns the item kind so callers can tell unplanned from planned. Alternatives: (a) keep `kind: change` for ideas - blurs "has a plan"; (b) firstmate-style `future` hold - hides ideas from plain queued listings and is a different concept; (c) minted random-suffix slugs - leak into branch names and commits; (d) a new ADR status for rejected - existing `accepted` ADR "Do not X" already works.

## Steps

- `01-add-idea-and-backlog-commands.md` - idea and backlog commands, slug derivation, shared slug check
- `02-adopt-ideas-in-new-and-guard-start.md` - new adopts unplanned items with --from, start refuses them, where reports kind
- `03-document-backlog-conventions.md` - skills, setup block and docs for the backlog flow

## Acceptance

- `change-axi idea "..."`, `change-axi backlog`, `change-axi new <slug>` leave one backlog item with `kind: change` and a seeded Why.
- `change-axi new <new> --from <old>` leaves no duplicate and keeps priority, repo and blocked-by.
- `change-axi start <idea-slug>` fails with the "propose it first" hint.
- `idea`/`new` reject a slug that is active, archived, or in the backlog in any state.
- `npm test` passes; `change-axi check add-backlog-ideas` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: `idea`, `backlog`, `new --from`.
- `docs/architecture/plan-workflow.md` - update: unplanned items, adoption, priority, deprioritize vs do-not-do.
- `docs/domain/glossary.md` - update: idea, bug, chore, unplanned item, Ready.
- `docs/decisions/` - new ADR: unplanned backlog items use their own kinds and are promoted by `change-axi new`.
- `skills/plan-explore/SKILL.md`, `skills/plan-propose/SKILL.md`, `skills/plan-apply/SKILL.md` - update: backlog item as input, adopt, refuse unplanned start.
- `docs/decisions/0013-unplanned-backlog-items-use-their-own-kinds-and-are.md` - new ADR (proposed), created at propose.

## Risks and open questions

- `tasks-axi update --kind` and `rm` must behave on the markdown backend for blocked-by links when renaming with `--from`; verify in step 2 and fail without partial change.
- An item added directly with `tasks-axi add` and no kind is treated as unplanned only when its kind is idea, bug or chore; other kinds are left alone.
- Adopting a blocked item carries its blocked-by links and shows them in the output.
