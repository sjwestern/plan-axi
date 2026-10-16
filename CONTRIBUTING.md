# Contributing

```sh
npm install
npm run build     # docs-axi first, then change-axi (it imports docs-axi/lib/*)
npm test          # vitest, both packages
```

Needs Node >= 20 and `tasks-axi` on PATH (change-axi tests call it; `TASKS_AXI=<bin>` overrides).

## Layout

```
packages/docs-axi/     src/commands/*.ts   one file per command group
                       src/sections.ts     pure heading/section logic
                       src/sectionedit.ts  raw text in, edited text out (shared)
packages/change-axi/   src/commands.ts     all commands
                       src/spec.ts         required sections (single source)
                       src/check.ts        plan validation
skills/                agent skills (prompt only; symlinked by `npm run skills:install`)
```

change-axi reuses docs-axi code through `docs-axi/lib/<module>` (no `.js` extension). Export new shared code the same way.

## Add a command

1. Define a `CmdSpec` (flags, arg counts, `--help` text) and a handler returning an object or string.
2. Register it in `src/cli.ts` (`COMMANDS`) and the top-level help.
3. Add a test in `test/` using `tempRepo()` (temp git repo, runs the CLI in-process).

## Rules

- Output follows [AXI](https://github.com/kunchenguid/axi): TOON, short, content first, idempotent, fail loud with suggestions.
- Writes never echo the body they wrote.
- Never parse `tasks.md`; go through `tasks-axi list --fields ...` (see `src/tasks.ts`). Always pass `--file`.
- Output must be byte-stable across OSes: `/` paths, LF, locale-independent sort.
- Change required plan sections only in `change-axi/src/spec.ts`; skills point at `change-axi spec`.

Design: `docs/` (architecture, ADRs). Open items and resume notes: `.agent-memory/plan-axi.md`.
