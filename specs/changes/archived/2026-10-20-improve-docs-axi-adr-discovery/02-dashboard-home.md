# 02 - Dashboard home

Owns: packages/docs-axi/src/commands/read.ts, packages/docs-axi/test/home.test.ts
Docs: none

## Goal

Bare docs-axi prints a dashboard with no index rows.

## Context

ADR-0011-adrs-are-read-through-the-adr-subcommand. Reuse section counts already computed in homeCommand. ADR status counts come from the ADR section docs.

## Work

Rewrite homeCommand: docs dir and total, counts per section and other, adrs: N (X accepted, Y proposed, ...), sections guide block, help hints for search, adr list, list [section]. Keep the no-folder and 0-docs states.

## Done when

test/home.test.ts passes: no doc rows in output, counts and adrs line present, empty states unchanged. npm test passes.
