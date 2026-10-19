# Use conventional commits with a Change trailer and lint them

## Why

change-axi writes commit messages like `start foo`, `foo: done 01-x` and `archive foo`, and skills tell agents to use `<slug>: <summary>`. History is not machine-readable, so no changelog can be generated and tool commits cannot satisfy a conventional-commit hook. The owner also wants the same tool to work in other repos that enforce commitlint.

## Context

Docs: architecture/plan-workflow.md, domain/cli-quick-reference.md. No ADRs apply; a new ADR records the commit convention. Code: packages/change-axi/src/{git,start,done,archive}.ts; tests start.test.ts, archive.test.ts, finish.test.ts, done.test.ts. Skills: plan-apply, plan-propose, plan-archive.

## What changes

- Tool commits default to `chore(plan): start change`, `chore(plan): done <step-id>`, `chore(plan): archive change`, each with a `Change: <slug>` trailer.
- Type, scope and trailer key are config in `.plan-axi.toml` (`[commit] type`, `plan_type`, `scope`, `trailer`; repo over user; `plan_type` is the type for plan commits, default `docs`). `scope = ""` drops the scope, `trailer = ""` drops the trailer. Defaults are `chore`, `docs`, `plan`, `Change`, so another repo with different commitlint rules sets its own.
- `change-axi commit-plan [<slug>] [--reason "..."] [--dry-run]` is the human step that saves a generated plan. With no slug it picks the one active change that has uncommitted files (several -> error listing them). It commits only the plan paths (plan folder, backlog.md, docs dir) after a clean `check`, as `docs(plan): propose <slug>` (or the reason) with the trailer, honoring `[commit]` config and hooks. plan-propose still does not commit; it tells the human to run this command. Agents use it for plan amendments.
- A hook rejecting a tool commit fails the command with an AxiError carrying the hook output. `start` and `done` restore the file they changed so a rerun works; `archive` leaves its changes staged and the error says so.
- Skills tell agents to write conventional commits scoped to the area changed (`feat(docs-axi): ...`, `fix(change-axi): ...`) with a `Change: <slug>` trailer; plan commits use `docs(plan): ...`. Skills say to follow the repo's commit rules (commitlint config) and to use the `[commit]` scope and trailer key when set.
- This repo gets commitlint (config-conventional) run by a husky `commit-msg` hook, installed by `prepare`.
- `npm run changelog` generates a human-readable CHANGELOG.md from commits with git-cliff, skipping the `plan` scope.

## Out of scope

Configurable subject wording (only type, scope and trailer key). Requiring the `Change:` trailer in lint. Rewriting history. Release automation or version bumps (the existing changeset scripts are untouched). Hooks beyond what git runs itself. A `docs-axi config`-style CLI for the commit settings (edit the TOML).

## Approach

A `commitStyle(root)` reader in change-axi reads `commit.type`, `commit.plan_type`, `commit.scope`, `commit.trailer` from `loadRawConfig` (docs-axi/lib/config, as agent.ts does for `apply.agent`), with defaults and validation (type and scope match `[a-z0-9-]+`, trailer is a git trailer token). One `commit(ctx, subject, slug, paths)` helper in git.ts builds `<type>(<scope>): <subject>` and `-m "<trailer>: <slug>"`, and maps failure to an AxiError with the hook output (not just the first stderr line). start.ts, done.ts and archive.ts call it. Tool tests keep using temp repos without hooks; one test installs a rejecting commit-msg hook for the failure path and others cover config overrides. Repo tooling is root devDependencies plus `commitlint.config.js`, `.husky/commit-msg` and `cliff.toml`. Alternatives: simple-git-hooks (smaller, less used; rejected for familiarity), conventional-changelog-cli (heavier config), full subject templates (more flexible, more to validate; later if needed).

## Steps

- `01-tool-commits-use-conventional-format-and.md` - tool commit subjects, trailer, clean failure
- `02-commitlint-and-husky-for-this-repo.md` - commitlint + husky hook
- `03-changelog-from-commits-with-git-cliff.md` - git-cliff changelog script
- `04-skills-ask-for-conventional-commits.md` - skill guidance (uses commit-plan)
- `06-commit-plan-command-commits-the-plan-wit.md` - `change-axi commit-plan`
- `05-docs-and-adr-for-commit-convention.md` - docs and ADR

## Acceptance

Run `npm test`. In a scratch commit, `git commit -m bad` is rejected and `git commit -m "chore(plan): x"` passes. `change-axi start|done|archive` in a temp repo produce `chore(plan): ...` with `Change: <slug>`; a rejecting hook makes them fail with `commit rejected` and start/done are rerunnable. `npm run changelog` produces CHANGELOG.md without chore(plan) entries.

## Docs impact

- `docs/decisions/0010-commits-are-conventional-with-a-change-trailer.md` - new: the convention and configurable type/scope/trailer (accepted at archive)
- `docs/architecture/plan-workflow.md` - update: commit format and hook failure behavior
- `docs/domain/cli-quick-reference.md` - update: commit subjects, trailer, `[commit]` config and `commit-plan`
- `README.md` - update: mention `[commit]` in the config section (outside docs layout, referenced by real path)
- `CONTRIBUTING.md` - update: hook install, changelog script (outside docs layout)

## Risks and open questions

- husky only works after `npm install` in each checkout; a missing `.husky/_` silently skips lint.
- Archive failure leaves staged changes the user must commit by hand.
- A repo whose commitlint requires other subject wording (e.g. sentence case, max length) can still reject the fixed `start change` / `done <id>` text; wording is not configurable yet.
