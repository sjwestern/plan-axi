# 01 - Rename herdr tab on enter

Owns: packages/change-axi/src/herdr-tab.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/enter-herdr-tab.test.ts, docs/architecture/plan-workflow.md, docs/domain/cli-quick-reference.md
Docs: docs/architecture/plan-workflow.md

## Goal

Inside herdr, `change-axi enter <slug>` renames the current tab to the slug, best effort, with tests and docs.

## Context

Herdr CLI: `herdr tab rename <TAB_ID> <LABEL>...`. Env in herdr panes: `HERDR_ENV=1`, `HERDR_TAB_ID`; `HERDR_BIN_PATH` is the binary. The agent runs blocking via `runAgent`, so rename must come before it. No shell string building. Never fail enter on a herdr error. Follow the fake-binary-on-PATH pattern in test/enter.test.ts. Tier: none configured.

## Work

1. `src/herdr-tab.ts`: `renameHerdrTab(label, env = process.env): void`. Return unless `env.HERDR_ENV==='1'` and `env.HERDR_TAB_ID`. `spawnSync(env.HERDR_BIN_PATH || 'herdr', ['tab','rename',tabId,label], {stdio:'ignore', timeout:2000})` in try/catch.
2. `commands.ts` `enterCommand`: call `renameHerdrTab(slug)` after the step validation following `requireChange`. Not reached for `--list` or unresolved-slug outputs.
3. `test/enter-herdr-tab.test.ts`: fake `herdr` on PATH logging argv. Cases: herdr env renames with slug and tab id; no `HERDR_ENV` no call; `--list` no call; failing binary leaves output and exit code unchanged; `--print` still renames.
4. Docs: one sentence in plan-workflow.md enter section, one line in cli-quick-reference.md near the enter commands.

## Done when

`npm test` passes. In a real herdr pane, `change-axi enter <slug> --print` renames the tab to `<slug>` (`herdr tab get $HERDR_TAB_ID`). `docs-axi check` passes.
