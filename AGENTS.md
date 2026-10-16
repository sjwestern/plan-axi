# Agent instructions

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
- For "what's next", "what's in progress", or "what needs doing" questions, run `change-axi` (active changes and next step) and `tasks-axi list` (backlog) instead of reading plan files.
- Use `change-axi` and `tasks-axi` for plan files. Never hand-edit `tasks.md` or `backlog.md`.
<!-- plan-axi:end -->
