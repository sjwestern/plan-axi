# Make fresh worktrees and skills work without npx guesswork

## Why

Agents burn calls in fresh treehouse worktrees: no node_modules or dist, so tests and builds fail until they bootstrap by hand. Skills tell agents to fall back to `npx -y change-axi@0.1.0`, but `change-axi` and `docs-axi` are not on npm; agents ran npx on every call even with binaries on PATH (slow), and an unowned npm name is a supply-chain risk. The global linked CLI in a worktree is the main checkout's build, so new commands are invisible and CLI work cannot be smoke-tested.

## Context

Docs read: `docs/architecture/plan-workflow.md`, `docs/architecture/package-structure.md`, `docs/domain/cli-quick-reference.md`. ADRs: 4 (plans on main, steps in worktree). Trial review in `.agent-memory/plan-axi.md` (Next work items 1-3). Skills: plan-explore, plan-propose, plan-apply, plan-archive, plan-migrate-docs.

## What changes

- Skills call `change-axi`, `docs-axi`, `tasks-axi` directly; they never suggest `npx` for our two packages. `tasks-axi` keeps a pinned npx fallback only after "command not found".
- plan-apply tells the agent to follow the repo bootstrap (AGENTS.md / CONTRIBUTING) before implementing in a fresh worktree.
- Repo has an `AGENTS.md` with the bootstrap line (`npm install && npm run build`) and the in-worktree CLI form `node packages/change-axi/dist/bin/change-axi.js`.
- `packages/change-axi` gets a `dev` script like docs-axi; CONTRIBUTING documents both.
- Finding recorded: whether treehouse has a post-create hook that could run the bootstrap.

## Out of scope

Publishing or scoping the npm names (separate decision, see risks). CI. Teaching `change-axi` to run bootstrap itself.

## Approach

Prompt and doc edits only, plus one package.json script. Skills state: use the binary on PATH; if missing, stop and tell the user to install (`npm run build && npm link`), since no published package exists. Bootstrap lives in repo docs (AGENTS.md), and the apply skill points at it generically so it works for any repo, not just this one. Alternative: a treehouse post-create hook (checked in step 02; adopted only if treehouse supports it per repo). Alternative: `change-axi enter` runs bootstrap - rejected here, repo-specific.

## Steps

- `01-skills-call-binaries-directly.md` - skills stop suggesting npx; apply bootstraps worktrees
- `02-repo-bootstrap-and-dev-script.md` - AGENTS.md, CONTRIBUTING, README, dev script

## Acceptance

- `grep -rn 'npx' skills/` shows only the tasks-axi fallback.
- Fresh worktree: following AGENTS.md alone yields a passing `npm test`.
- `npm run dev -w packages/change-axi -- --help` prints help.
- `change-axi check bootstrap-fresh-worktrees` and `docs-axi check` pass.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: add the in-worktree dev form and `dev` script note.

## Risks and open questions

- npm names `change-axi`/`docs-axi` unowned: decide publish vs scope before any npx advice returns.
- Removing the npx fallback breaks users without a link; README must say how to install.
- Overlaps `docs/domain/cli-quick-reference.md` with add-claim-done-commands; merge sequentially.
