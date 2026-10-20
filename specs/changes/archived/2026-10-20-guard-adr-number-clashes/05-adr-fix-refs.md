# 05 - ADR fix-refs migration command

Owns: packages/docs-axi/src/commands/adrfixrefs.ts, packages/docs-axi/src/cli.ts, packages/docs-axi/test/adrfixrefs.test.ts
Docs: docs/decisions/0012-adr-references-carry-number-and-slug-and-clashes-are-guarded.md

## Goal

docs-axi adr fix-refs rewrites every ADR reference in a repo to the current ADR-NNNN-slug form, in docs, active changes and archived changes. It is the required one-time migration for repos that predate the full-ref rule.

## Context

ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. No soft rollout: after this change bare refs are hard errors in docs-axi check, change-axi check, commit-plan and finish, so existing repos must run fix-refs once. Rules: changes (active and archived) may reference docs; docs must not reference changes. A change that refers to an ADR by ADR-NNNN-slug must have a number and slug that match the current ADR. Uses the step 01 parser (findRefs, resolveRef, findBareRefs) and the adr router from change:improve-docs-axi-adr-discovery.

## Work

1. commands/adrfixrefs.ts: adr fix-refs [--dry-run]. Scan the docs dir, specs/changes/active and specs/changes/archived (skip code fences).
2. Bare refs (`ADR 7`, `ADR 0007`, `ADR-7`, `ADR-0007`) resolve by number. If exactly one ADR has that number, rewrite to ADR-NNNN-slug.
3. Full refs whose number matches exactly one ADR but whose slug is stale (ADR file renamed), rewrite to the current slug. A ref whose slug matches exactly one ADR but whose number differs is rewritten to that ADR number. Anything else is unresolved.
4. Ambiguous (number shared by several ADRs, or no match) are never guessed: list file, line, ref and candidates, exit non-zero, and point to docs-axi adr renumber for duplicate numbers.
5. Write only files that change. Output: counts of refs fixed per area (docs, active, archived), files changed, unresolved list, help line to run docs-axi check. --dry-run prints the same without writing.
6. Report docs files that reference a change (specs/changes/...) as a rule violation, listed but not rewritten.
7. Idempotent: a clean repo prints no-op and exits 0.
8. Wire into cli.ts and help. Bare-ref errors in docs-axi check and change-axi check (step 01) name this command: Run docs-axi adr fix-refs.

## Done when

test/adrfixrefs.test.ts passes: bare forms rewritten in docs, active and archived changes; stale slug updated; ambiguous number listed and left unchanged with non-zero exit; dry-run writes nothing; code fences untouched; docs referencing a change reported; second run is a no-op. npm test passes.
