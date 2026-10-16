# 04 - Slug-less enter

Owns: packages/change-axi/src/commands.ts, packages/change-axi/test/enter-pick.test.ts, docs/domain/cli-quick-reference.md
Docs: none

## Goal

enter without a slug resumes the only in-flight change, or helps choose among several.

## Context

Builds on listEnterable from step 03. ENTER_SPEC min becomes 0. Interactive pick uses node:readline, only when stdout and stdin are TTYs.

## Work

1. In enterCommand resolve slug: one in-flight change -> use it; several -> TTY: numbered prompt, non-TTY: print the list with a hint and exit 1; none -> hint to run change-axi.
2. Update usage/help text and cli-quick-reference.md.
3. Tests in enter-pick.test.ts.

## Done when

npm test passes; each of the one/several/none cases behaves as described.
