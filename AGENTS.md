# Agent instructions

Prefer ripgrep (rg) over grep when available.

## Bootstrap (fresh clone or worktree)

```sh
npm install && npm run build
```

Run this before tests or builds; fresh worktrees have no `node_modules` or `dist`.

## Test

```sh
npm test
```

## Run the worktree's own CLI

The global `change-axi`/`docs-axi` on PATH is the main checkout's build. To smoke-test code in this worktree:

```sh
node packages/change-axi/dist/bin/change-axi.js <args>
node packages/docs-axi/dist/bin/docs-axi.js <args>
```

Rebuild and run in one step: `npm run dev -w packages/change-axi -- <args>`.

## Skills

Skills in `skills/` are symlinked from `~/.agents/skills/`. Edit those here (`skills/<name>/SKILL.md`), never via the `~/.agents` path, and commit them with the repo. Other skills in `~/.agents/skills/` are not part of this repo.

<!-- plan-axi:start -->
## plan-axi

- On a branch matching `specs/changes/active/<slug>`, use the plan-apply skill (Execute mode). Run `change-axi` with no args for the change status and next step.
- For any question about change, step, or backlog state (what's next, in progress, blocked, or whether changes can run together), run `change-axi` and `tasks-axi list` first. Never read `tasks.md` or `backlog.md` directly (cat, rg, read). Step state lives on each change's worktree branch, so `main` is stale for it: use `change-axi status <slug>` from the worktree. Read `proposal.md` and step files only for content (scope, Owns), not state.
- Use `change-axi` and `tasks-axi` for plan files. Never hand-edit `tasks.md` or `backlog.md`.
- To find docs, start at the index: run `docs-axi` (lists the docs index; `docs-axi config` shows the docs layout and where each kind of doc goes), then `docs-axi search <terms>` for a topic and `docs-axi show <path> --section <name>` to read only what you need. If `docs-axi` is unavailable, use `rg <terms>` in the docs dir (it covers the index and doc bodies) and read only the matching files. Don't `rg` just the index when `docs-axi` works, since it lists only titles and summaries.
- For exploration and planning tasks, look at the docs first (see above) so the idea fits existing docs and ADRs.
<!-- plan-axi:end -->
