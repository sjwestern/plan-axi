# plan-axi

Lightweight plan -> apply -> archive workflow for coding agents. Inspired by OpenSpec, with different trade-offs:

- No delta-spec merge. Docs in `docs/` are edited directly; archived changes are history only.
- No checkbox task lists. Task state and dependencies live in [tasks-axi](https://github.com/kunchenguid/tasks-axi).
- Deterministic CLIs that follow [AXI](https://github.com/kunchenguid/axi) (TOON output, content-first, idempotent, fail-loud).

## Packages

| Package | Status | Purpose |
|---|---|---|
| `packages/docs-axi` | v0.1 | `docs/` folder (domain, architecture, decisions): generated index, search, scaffolding, ADR numbering, checks, section read/write |
| `packages/change-axi` | v0.1 | change folders under `specs/changes/`: scaffold proposal/steps (required sections), section read/write, task deps, check, status. Apply/archive preflights not yet built |
| `skills/` | v0 (prompt-only) | `plan-explore`, `plan-propose`, `plan-apply`, `plan-archive`, `plan-migrate-docs` |

## Layout this workflow assumes

```
docs/{domain,architecture,decisions}/    shared human + agent docs, indexed in docs/README.md
specs/changes/active/<slug>/             proposal.md, NN-*.md step files, tasks.md (tasks-axi only)
specs/changes/archived/<date>-<slug>/
backlog.md                               repo level: one tasks-axi task per change
```

## Config (docs-axi)

Optional TOML, merged (arrays unioned): user `~/.config/plan-axi/config.toml` (or `$XDG_CONFIG_HOME/plan-axi/`), then repo `.plan-axi.toml`.

```toml
[docs]
ignore = ["todo/", "reports/", "**/*.draft.md"]   # paths relative to docs/; never indexed or reported

[docs.map]                                        # adopt legacy files in place, no moving
domain = ["domain.md", "domain-glossary.md", "features/"]
architecture = ["standards/"]
```

Always skipped: dot-entries, `node_modules/`, `_build/`, `_site/`, `site/`, `dist/`, `build/`. Files outside the layout are `UNMANAGED` warnings (exit 0). Mapped docs missing frontmatter or with odd names are warnings too.

## Section editing (docs-axi and change-axi)

Agents write and read single `##` sections instead of whole files: `sections`, `show --section`, `write --section` (stdin/`--body`), `append`. Selectors: `Heading`, `Parent/Child`, `Heading#2`. Writes never echo the body. `change-axi spec proposal|step` lists required sections; `change-axi check` errors on missing or empty ones.

## Quick start

```sh
npm install && npm run build
npm link -w packages/docs-axi -w packages/change-axi   # docs-axi, change-axi on PATH
npm run skills:install                                  # skills for your agent
```

Plan by hand (agents do the same through the skills):

```sh
change-axi new split-auth "Split the auth module"
printf 'Token code is tangled with sessions.' | change-axi write split-auth proposal --section Why
change-axi step add split-auth "Extract token store" --owns src/auth/tokens/
change-axi dep split-auth 02-api --on 01-extract-token-store
change-axi check split-auth --waves      # verify before you commit the plan
```

Verify a plan: `change-axi check <slug>` (exit 1 on errors), `change-axi status <slug>`, `docs-axi check`, then read `git diff`. Docs: [docs/](docs/README.md). Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## Skills

Install with `npm run skills:install` (symlinks `skills/*` into `~/.agents/skills`, which pi and other agents read; idempotent, refuses to overwrite non-link conflicts). Remove with `npm run skills:uninstall`. Use `node scripts/install-skills.mjs --dir <path>` for another location. They call `tasks-axi` (pin `0.2.6`) and `docs-axi`.

Flow: `plan-explore` (read-only, reads `docs/`) -> `plan-propose` (writes the plan, no commit) -> you review and commit on main -> `plan-apply` (on main: start + treehouse worktree + prompt; in the worktree: run steps) -> `plan-archive`.
