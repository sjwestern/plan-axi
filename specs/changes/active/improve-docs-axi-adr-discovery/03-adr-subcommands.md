# 03 - ADR subcommands

Owns: packages/docs-axi/src/cli.ts, packages/docs-axi/src/commands/adr.ts, packages/docs-axi/src/commands/write.ts, packages/docs-axi/test/adr.test.ts
Docs: none

## Goal

docs-axi adr has bare hint, list, search and add; old create form errors with a hint.

## Context

ADR 0011, 0009. Wrap the step 01 core with the ADR section from the layout. If the layout has no ADR section, error with a hint to run docs-axi config. cli.ts routes the adr command; create logic stays in write.ts (move to adr add).

## Work

1. New commands/adr.ts router: bare (counts by status + hints), list, search, add.
2. adr list [--status s|all] [--full] [--limit n]: schema number,title,status,summary; --full adds truncated decision text (with char total and show hint) and superseded-by.
3. adr search <terms> [--all] [--full] [--limit n]: shared search core scoped to ADR section.
4. adr add: existing create path and flags.
5. docs-axi adr "<title>" (non-subcommand) errors with help: docs-axi adr add "<title>".
6. Update cli.ts help and examples.

## Done when

test/adr.test.ts passes: bare hint, list all/status/--full truncation, search scoped to ADRs, add creates numbered ADR, old form errors, unknown flag errors, empty status gives 0-with-context message. npm test passes.
