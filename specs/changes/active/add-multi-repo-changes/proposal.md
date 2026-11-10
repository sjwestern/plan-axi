# Support changes that span several repos

## Why

Some changes edit several repos, and one of them can be a Windows checkout reached from WSL. change-axi only leases and merges a worktree for the plan repo, so agents create the other worktrees by hand, run raw git/treehouse calls to find branches, and `done` and `finish` cannot see edits outside the plan repo. Windows-side repos also need Windows git and treehouse, because WSL git can corrupt a worktree created by a Windows tool.

## Context

- docs/architecture/plan-workflow.md: the explore/propose/apply/archive flow and tool ownership.
- docs/architecture/package-structure.md: where change-axi code lives.
- docs/domain/cli-quick-reference.md: command reference to update.
- ADR-0004-plans-are-committed-on-main-steps-run-in-a-worktree: one worktree per change; this extends it to one per repo.
- ADR-0006-agent-launch-uses-a-command-template: enter launches the agent in the plan worktree.

## What changes

- `.plan-axi.toml` gains `[repos.<name>]`: `path` (home-relative, e.g. `~/projects/org/name`), optional `platform = "wsl"|"windows"`, optional `git` and `treehouse` command overrides.
- Proposals gain a `Repos:` header, `name@base` entries (e.g. `Repos: web@release/2.1, api`). A repo with no `@base` uses its default branch. The plan repo is implicit and uses its default branch.
- `<repo>:` prefixes in step `Owns` must name a repo listed in `Repos:`; `change-axi check` errors otherwise.
- `start` and `enter` lease one treehouse worktree per listed repo, all on branch `<slug>`, from that repo base. Leases are idempotent and the output lists each repo branch, base and path.
- Bare `change-axi`, `status` and `done` report per-repo branch and clean/dirty state, and `done` reports OUTSIDE_OWNS per repo.
- `finish` preflights every repo, refuses while any repo needs a rebase or is dirty, then ff-merges the external repos into their bases, returns their leases, and finishes the plan repo last. `finish --dry-run` prints a repo table with ahead/behind and the rebase command for each repo that needs one.
- Runtime platform is detected once. Under WSL a `platform = "windows"` repo runs git.exe, treehouse.exe and pwsh.exe with `wslpath` conversion and stdin from /dev/null. On native Linux, Mac and native Windows every repo is native and the flag is ignored.

## Out of scope

- Running the agent in more than one worktree, or sharing a worktree between changes.
- Pushing, tagging or opening pull requests in any repo.
- Auto-resolving rebase conflicts; finish stops and reports.
- Verifying native Windows on a real machine (logic is unit-tested with injected platform/env only).
- Per-repo base branch in config; the base lives in the plan.

## Approach

A new `repos.ts` module resolves the platform (WSL, native Windows, other), expands `~` per repo (os.homedir, or the Windows profile via cmd.exe + wslpath under WSL for windows repos), and exposes a `RepoRuntime` with `git(args)`, `treehouse(args)` and path conversion. All platform, env and command execution is injected so tests cover the three platform cases without a Windows machine. Existing start/finish/done code takes a runtime per repo; the plan repo uses the native runtime so single-repo behavior is unchanged.
`Repos:` is parsed from the proposal header next to the existing header lines; bases live in the plan because they vary per change (a fix on main versus work on a release or feature branch).
Finish runs all checks first, then merges externals, then the plan repo, and a re-run skips repos already merged so partial failure is recoverable.
Alternatives: base branch in config (rejected: varies per change); detecting Windows repos by /mnt path (rejected: a WSL clone of the same repo is ambiguous, so an explicit flag is used); a hand-run flow documented in skills only (rejected: the friction is repeated lookups and unchecked edits).
The decision is recorded as an ADR.

## Steps

- `01-repo-config-and-platform-runtime.md` - repo config, platform detection and per-repo git/treehouse runtime.
- `02-repos-header-and-owns-check.md` - Repos proposal header and Owns prefix validation.
- `03-lease-worktrees-per-repo-on-start-and-en.md` - start/enter lease one worktree per repo.
- `04-per-repo-state.md` - per-repo state in home, status and done.
- `05-finish-across-repos.md` - preflight, dry-run table and ff-merge across repos.
- `06-docs-and-skills.md` - docs and skill updates.

## Acceptance

- `npm test` passes, including repos unit tests for WSL, native Windows and Linux/Mac with injected platform, env and runner.
- With a two-repo fixture, `change-axi start <slug>` leases both worktrees on branch `<slug>` and a second run reuses them.
- `change-axi check <slug>` errors on an Owns prefix not in `Repos:`.
- `change-axi finish <slug> --dry-run` lists each repo with ahead/behind and a rebase command where needed, and a real finish refuses until all repos are rebased and clean.
- A single-repo change behaves as before (existing tests unchanged).
- Windows-from-WSL leasing and finish are smoke-tested by hand; native Windows is not verified.

## Docs impact

- `docs/architecture/plan-workflow.md` - update: multi-repo leases, Repos header, finish across repos.
- `docs/domain/cli-quick-reference.md` - update: repos config, Repos header, finish dry-run table.
- `docs/decisions/` - new ADR: changes span repos with per-repo worktrees, bases in the plan, platform flag.
- `skills/plan-apply/SKILL.md` and `skills/plan-propose/SKILL.md` - update: multi-repo conventions.

## Risks and open questions

- treehouse.exe may need the pwsh.exe wrapper even with a /mnt cwd; keep the wrapper unless a test shows it is unneeded.
- Partial finish leaves some repos merged; mitigated by preflight, an idempotent re-run and a clear report.
- Existing start/finish code assumes one repo; the refactor touches shared commands.ts, so steps are chained.
- Native Windows behavior is unverified.
