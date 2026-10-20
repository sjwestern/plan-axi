# 03 - Guard commit-plan and finish

Owns: packages/change-axi/src/adrguard.ts, packages/change-axi/src/commitplan.ts, packages/change-axi/src/finish.ts, packages/change-axi/test/adrguard.test.ts
Docs: none

## Goal

commit-plan and finish fail on ADR number clashes or unresolved refs with guidance to fix them.

## Context

ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded. No fetch. Run the docs checks that already exist plus the step 01 ref checks. finish already has preflight checks in finish.ts.

## Work

1. src/adrguard.ts: checkAdrs(ctx) returns duplicate numbers in the tree, ADR numbers already used by a different file on the local default branch or origin/<default> (git ls-tree, no fetch), and unresolved/bare refs. The file not present on the default branch is the one to renumber.
2. commit-plan and finish call it before committing; on failure throw VALIDATION_ERROR listing the files and at most two help lines: docs-axi adr renumber <ref>, then retry the same command. Add a pull hint (git pull --rebase) only when the local default branch is behind origin/<default>.
3. Dry-run output reports it too.

## Done when

test/adrguard.test.ts passes: duplicate in tree blocks commit-plan and finish; a number used on the default branch blocks and names the branch-side file; the help is at most two commands; after renumber the command succeeds; bare ref blocks. npm test passes.
