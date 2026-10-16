---
name: plan-explore
description: Read-only thinking partner that shapes a change before anything is written. Reads docs and code, asks about anything unclear, and builds a draft proposal in the conversation. Use when the user wants to explore, think through, or scope an idea, or says "explore". Writes nothing to disk; use plan-propose to materialize.
---

# Explore

Shape a change with the user. **Write nothing**: no files, no scratch notes, no commits, no task or doc mutations. Everything lives in the conversation until the user asks to propose.

## Read first

1. Docs map: `docs-axi` (no args). Then `docs-axi search <terms>` for the topic, and `docs-axi sections <path>` then `docs-axi show <path> --section <name>` for the parts that matter (read whole docs only when needed). Check ADRs in `decisions/` that touch the area; an accepted ADR is a constraint unless the user wants to supersede it.
2. If `docs-axi` is not installed: `npx -y docs-axi@0.1.0 <args>`.
3. Code: read what the idea touches. Prefer reading over guessing.
4. Planned and in-flight work, so the idea does not collide: `tasks-axi list --state queued` and `tasks-axi list --state in_flight` (repo `backlog.md`). Active plans: `specs/changes/active/*/proposal.md` titles only.

Say which docs you used. If nothing relevant exists, say "no relevant docs found" - do not invent context.

## Ask, do not assume

Ask about anything unclear that would change the plan: goal, who it is for, constraints, scope edges, what must not break. Batch questions (a short numbered list), most important first. Offer options with a recommendation when there are real alternatives. Stop asking when remaining unknowns would not change the plan; list them as open questions instead.

## Maintain a running draft

Keep a compact draft in the conversation and update it as the user answers. Show it when asked or when it changes materially:

- **Title** and likely **slug** (kebab-case, verb first, e.g. `add-dark-mode`)
- **Why**, **What changes**, **Out of scope**
- **Approach** and alternatives considered
- **Steps**: each with a name, `Owns:` paths, and `depends on` (other steps or none). Mark steps that can run in parallel
- **Docs impact**: docs to update or create, and decisions that deserve an ADR
- **Acceptance**: how the whole change is verified
- **Open questions**

Steps should be vertical, independently testable, and small enough to commit once. Prefer fewer, clearer steps. Separate steps that touch disjoint paths so they can run in parallel.

## Hand-off

When the draft is stable, say so and tell the user to ask to **propose** (skill `plan-propose`), which turns the draft into `specs/changes/active/<slug>/`. Do not start it yourself unprompted. If the user wants to change direction, update the draft; it is cheap.
