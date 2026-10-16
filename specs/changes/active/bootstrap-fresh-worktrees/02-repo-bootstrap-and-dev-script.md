# 02 - Repo bootstrap and dev script

Owns: AGENTS.md, CONTRIBUTING.md, README.md, packages/change-axi/package.json, docs/domain/cli-quick-reference.md
Docs: docs/architecture/package-structure.md

## Goal

A fresh clone or worktree is bootstrapped by one documented line, and CLI work can be smoke-tested against the worktree's own build.

## Context

No AGENTS.md exists yet (`change-axi setup` may later add a managed block; keep the bootstrap text outside it). docs-axi has `dev`: `node --experimental-strip-types bin/docs-axi.ts`. Run `treehouse init --help` / read treehouse docs to see whether a post-create hook exists; record the answer in CONTRIBUTING.

## Work

1. Add `"dev": "node --experimental-strip-types bin/change-axi.ts"` to packages/change-axi/package.json.
2. Create AGENTS.md: bootstrap (`npm install && npm run build`), test (`npm test`), in-worktree CLI form `node packages/change-axi/dist/bin/change-axi.js` and docs-axi equivalent.
3. CONTRIBUTING.md: same, plus note about the global linked CLI being the main checkout's build, and the treehouse hook finding.
4. README.md: install section says build + `npm link` (no npm publish yet).
5. cli-quick-reference: add the dev/in-worktree form via `docs-axi write`.

## Done when

`npm run dev -w packages/change-axi -- --help` prints help; `node packages/change-axi/dist/bin/change-axi.js --help` works after build; `docs-axi check` passes.
