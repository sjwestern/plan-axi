# 03 - Agent config and enter command

Owns: packages/docs-axi/src/config.ts, packages/docs-axi/test/config.test.ts, packages/change-axi/src/agent.ts, packages/change-axi/src/start.ts, packages/change-axi/src/commands.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/enter.test.ts
Docs: docs/decisions/0006-agent-launch-uses-a-command-template.md

## Goal

`change-axi enter <slug> [step]` starts (if needed), finds the worktree and runs the configured agent there with the apply prompt; start and enter hint when setup is missing.

## Context

ADR 6. `start.ts` has `leaseWorktree` (finds a worktree by `[slug]` label or leases one) and `startChange`; export `leaseWorktree`. Config resolution order: repo `.plan-axi.toml` `[apply] agent`, user config, env `CHANGE_AXI_AGENT`, PATH autodetect table. `docs-axi/src/config.ts` currently exposes docs tables only; add a raw merged-tables accessor and keep behavior and tests for docs unchanged. Spawn with `cwd` = worktree, `stdio: inherit`, shell-quote `{prompt}`. Non-TTY or `--print`: print instead of spawn. If already on branch `<slug>` use the current directory.

## Work

1. `docs-axi/src/config.ts`: export `loadRawConfig(root)` (merged tables, arrays unioned, scalars repo over user). Test for `[apply] agent` merge order.
2. `src/agent.ts`: `resolveAgent(root)` (config, env, autodetect table: pi, claude, codex, gemini -i, opencode --prompt), `buildCommand(template, {prompt, slug, step, path})` with shell quoting for POSIX and Windows, `runAgent`.
3. `enter` command: not in flight -> `startChange`; in flight -> `leaseWorktree`; then run or `--print`. Without an agent: print path, enter command, prompt, and how to set `[apply] agent`.
4. In `start` and `enter` output add a `help` hint when `hasSetupBlock` is false (never edit files).
5. Tests with a fake agent script as the template asserting cwd and the prompt argument; `--print`; no-agent fallback.

## Done when

`npm test` passes (docs-axi and change-axi). With `[apply] agent = "<fake-agent> {prompt}"`, `change-axi enter <slug>` runs the fake in the worktree with `apply <slug>` as its argument; `--print` runs nothing.
