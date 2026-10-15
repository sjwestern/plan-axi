# plan-axi

Lightweight plan -> apply -> archive workflow for coding agents. Inspired by OpenSpec, with different trade-offs:

- No delta-spec merge. Docs in `docs/` are edited directly; archived changes are history only.
- No checkbox task lists. Task state and dependencies live in [tasks-axi](https://github.com/kunchenguid/tasks-axi).
- Deterministic CLIs that follow [AXI](https://github.com/kunchenguid/axi) (TOON output, content-first, idempotent, fail-loud).

## Packages

| Package | Status | Purpose |
|---|---|---|
| `packages/docs-axi` | v0.1 | `docs/` folder (domain, architecture, decisions): generated index, search, scaffolding, ADR numbering, checks |
| `packages/change-axi` | planned | change folders under `specs/changes/`, dependency/cycle checks, apply/archive preflights |
| `skills/` | planned | explore, propose, apply, archive agent skills |

## Layout this workflow assumes

```
docs/{domain,architecture,decisions}/    shared human + agent docs, indexed in docs/README.md
specs/changes/active/<slug>/             proposal.md, NN-*.md step files, tasks.md (tasks-axi only)
specs/changes/archived/<date>-<slug>/
backlog.md                               repo level: one tasks-axi task per change
```

## Develop

```sh
npm install
npm run build
npm test
npm link -w packages/docs-axi   # optional: put docs-axi on PATH
```

Design notes: `.agent-memory/plan-axi.md`.
