# Agent launch: branch-aware home, enter, setup

## Why

After `change-axi start`, the user still has to enter the worktree, open an agent, and type `apply <slug> <step>`. Agents opened in a worktree also do not know a plan is in progress unless told. The goal is one command from a committed plan to a working agent, and an agent that orients itself, without per-agent-CLI code.

## Context

Docs read: `architecture/plan-workflow.md` (step execution), ADR 4 (plans on main, steps in a treehouse worktree), ADR 1 (task state via tasks-axi). `change-axi start` already leases the worktree and prints `enter:`. `treehouse enter --print-path <id>` prints a path; `pi [messages...]` takes the first prompt as an argument. Config today: `docs-axi/src/config.ts` reads `~/.config/plan-axi/config.toml` and `.plan-axi.toml`, docs tables only.

## What changes

- Bare `change-axi` on a change branch (branch name = an active change slug) shows that change: progress, steps with state and wave, steps in flight, ready steps, and the exact next prompt. Same view works to resume after a context reset.
- `change-axi enter <slug> [step]`: finds or leases the worktree (running the `start` preflight and start commit first when the change is not yet in flight), then runs the configured agent command in the worktree with the prompt `apply <slug> [step]`. `--print` only prints the path and command.
- Agent command comes from config `[apply] agent = "pi {prompt}"` (repo `.plan-axi.toml` over user config), then env `CHANGE_AXI_AGENT`, then autodetect from PATH of a small built-in table. Placeholders: `{prompt}` (shell-quoted), `{slug}`, `{step}`, `{path}`. No match: print path, enter command and prompt, and tell the user how to configure.
- `change-axi setup [--file <f>] [--remove]` adds or removes a managed block in `AGENTS.md` (or an existing `CLAUDE.md`) telling agents to use `plan-apply` Execute on a change branch. Idempotent. `start` and `enter` print a one-line hint when the block is missing; they never edit the file.

## Out of scope

- Launching several agents at once (`enter <slug> <step>` per pane is the parallel path).
- Writing agent-specific config files beyond the AGENTS.md block, or support for agents with no prompt-argument CLI.
- Changing `treehouse` or the user's shell hook.

## Approach

- New modules in `packages/change-axi/src`: `home.ts` (branch-aware view, reuses `checkChange`/`listTasks`), `agent.ts` (resolve template, build command, spawn), `setup.ts` (managed block). `enter` reuses `startChange` and a newly exported `leaseWorktree` from `start.ts`.
- The agent runs by direct spawn with `cwd` = worktree and inherited stdio, not through `treehouse enter`, so a user shell hook that opens an agent does not open a second one.
- Config: extend `docs-axi/src/config.ts` to expose the merged raw tables (it already merges user + repo); change-axi reads `[apply]`. One TOML parser stays in one place.
- Built-in table maps agent binary to template: `pi {prompt}`, `claude {prompt}`, `codex {prompt}`, `gemini -i {prompt}`, `opencode --prompt {prompt}`. Only pi is verified here; the others are documented as best-effort and overridable.
- Alternatives rejected: per-agent adapters beyond a template table (maintenance), editing the user's shell hook (not portable), auto-editing AGENTS.md from `start` (surprising writes; a hint plus explicit `setup` instead).
- Decision recorded as ADR 6.

## Steps

- `01-branch-aware-home.md` - bare change-axi on a change branch shows that change
- `02-setup-command-for-agents-md.md` - setup adds/removes the AGENTS.md block
- `03-agent-config-and-enter-command.md` - agent template config and enter
- `04-docs-and-skill-updates.md` - docs, README and apply skill

## Acceptance

- `npm test` passes, including new tests for home, setup, config resolution and enter (`--print`, and a fake agent script as the template).
- In a worktree on branch `<slug>`, `change-axi` prints status and the next prompt.
- `change-axi enter <slug> --print` on main prints worktree, agent command and prompt; with a fake `[apply] agent` it runs that command in the worktree with the prompt as its argument.
- `change-axi setup` twice leaves one block in `AGENTS.md`; `setup --remove` restores the file.

## Docs impact

- `docs/decisions/0006-agent-launch-uses-a-command-template.md` - new ADR (proposed): launch via configurable template, no per-agent adapters, direct spawn
- `docs/domain/cli-quick-reference.md` - update: `enter`, `setup`, branch-aware home, `[apply] agent` config
- `docs/architecture/plan-workflow.md` - update: launch/enter flow and how an agent orients itself
- `README.md` - update: quick start uses `change-axi enter`

## Risks and open questions

- Prompt-argument syntax for claude, codex, gemini and opencode is unverified here; template table may need fixes after a real run.
- Direct spawn bypasses the user's treehouse shell hook (intended); confirm that is what users want.
- Branch-aware home depends on the branch name equalling the slug; a renamed branch gets the normal home.
