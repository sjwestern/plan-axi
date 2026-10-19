# 04 - docs-axi config command and init flags

Owns: packages/docs-axi/src/commands/config.ts, packages/docs-axi/src/configwrite.ts, packages/docs-axi/src/cli.ts, packages/docs-axi/test/configcmd.test.ts
Docs: none

## Goal

Users inspect and edit the layout with `docs-axi config`; `init` follows it.

## Context

`.plan-axi.toml` is user-edited, so the writer must keep comments and unrelated tables. Skills (step 07) call bare `docs-axi config` as the stable layout contract.

## Work

1. `commands/config.ts`: no flags prints `docs_dir`, `sections[N]{name,guide,type}` and `sources` (default|user|repo).
2. Flags `--dir`, `--sections a,b,c`, `--adr <name>|none`, `--guide name="text"` (repeatable) write the repo `.plan-axi.toml` via `configwrite.ts`: line-based upsert of `[docs]` keys and `[docs.section.<name>]` tables only. Validate the resulting layout before writing; refuse to write an invalid one.
3. After writing, print the follow-up: run `docs-axi migrate` when docs exist outside the new sections.
4. `init --sections ... --adr ...` shorthand runs config then init. Register in `cli.ts` and help.

## Done when

`npm test` passes. Tests: bare `config` on a repo with no file prints defaults; writing preserves comments and other tables; invalid input writes nothing; `config --sections guides,rfcs --adr rfcs --guide ...` then `docs-axi new guides ...` works; `config` shows repo as the source.
