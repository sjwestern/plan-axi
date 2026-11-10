# Name the herdr tab after the change on enter

## Why

Inside herdr, a tab running `change-axi enter <slug>` keeps its default name, so with several changes open it is hard to tell tabs apart. Naming the tab after the change slug makes the controller's tabs scannable.

## Context

Docs read: docs/architecture/plan-workflow.md (enter flow), docs/domain/cli-quick-reference.md (enter flags), ADR-0008-run-launches-ready-steps-as-herdr-tabs (herdr is an optional environment, outside it commands print). Code: `enterCommand` in packages/change-axi/src/commands.ts. Related: change:add-run-wave adds a herdr backend and labels its own tabs `<slug>/<step>`; it never calls `enter`, so no label clash. Herdr CLI: `herdr tab rename <TAB_ID> <LABEL>...`; panes get `HERDR_ENV=1` and `HERDR_TAB_ID`; `HERDR_BIN_PATH` points at the binary.

## What changes

- `change-axi enter` renames the current herdr tab to the change slug, always on, no flag or config.
- Runs once the slug is resolved and validated, before the agent starts (the agent blocks the terminal). Skipped for `--list` and unresolved-slug outputs; applies to `--print` and non-TTY runs too, since enter already leases the worktree there.
- Best effort: skipped unless `HERDR_ENV=1` and `HERDR_TAB_ID` are set; a missing binary, nonzero exit or timeout is ignored and never changes output or exit code.
- The label is the slug only, not the step.

## Out of scope

Restoring the old label (on finish, archive or agent exit) and any state storage for it; revisit later. Renaming on commands other than `enter`. Step-level labels (change:add-run-wave owns `<slug>/<step>` for run). A config opt-out. Other multiplexers. Sharing a herdr module with change:add-run-wave.

## Approach

New `src/herdr-tab.ts` exporting `renameHerdrTab(label, env = process.env)`: returns early unless `HERDR_ENV==='1'` and `HERDR_TAB_ID` set; `spawnSync(env.HERDR_BIN_PATH || 'herdr', ['tab','rename',tabId,label], {stdio:'ignore', timeout:2000})`, argument array and no shell, wrapped in try/catch. `enterCommand` calls it after `requireChange` and step validation, when not `--list`. Tests put a fake `herdr` on PATH (as enter.test.ts does for agents) that logs argv.
Alternatives: opt-out flag (rejected, always on); rename from the agent/skill (rejected, not deterministic); a run/ backend (rejected, that change is unmerged and a one-call helper is simpler).
Decision: no ADR, small additive behavior.

## Steps

- `01-rename-herdr-tab-on-enter.md` - helper, enterCommand hook, tests, docs

## Acceptance

- `npm test` passes, including test/enter-herdr-tab.test.ts using a fake herdr on PATH.
- In a herdr pane, `change-axi enter <slug> --print` renames the tab to the slug; outside herdr nothing changes.

## Docs impact

- `docs/architecture/plan-workflow.md` - update: enter renames the herdr tab to the slug when run inside herdr, best effort.
- `docs/domain/cli-quick-reference.md` - update: one line under the `enter` entries.

## Risks and open questions

- The tab keeps the slug after the change finishes (no restore yet).
- If herdr changes the CLI syntax, the rename silently no-ops; acceptable for a cosmetic feature.
