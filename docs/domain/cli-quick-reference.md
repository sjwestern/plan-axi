---
title: CLI quick reference
summary: One-screen reference for docs-axi and change-axi commands with examples
---

# CLI quick reference

Run `<tool> <command> --help` for flags.

## docs-axi

```sh
docs-axi                                   # map
docs-axi search billing invoice
docs-axi sections domain/billing           # headings and refs
docs-axi show domain/billing --section Refunds
printf 'text' | docs-axi write domain/billing --section Refunds
docs-axi append domain/billing --section "Open questions" --body "- Tax?"
docs-axi new domain "Billing" --summary "Invoice rules" --body-file -
docs-axi adr "Use Postgres" --summary "Why jobs live in Postgres" \
  --context "..." --decision "..." --consequences "..."
docs-axi update 7 --status accepted
docs-axi check
```

## change-axi

```sh
change-axi spec proposal                   # required sections and what each holds
change-axi new split-auth "Split the auth module"
change-axi write split-auth proposal --section Why --body "Slow builds."
change-axi step add split-auth "Extract tokens" --owns src/auth/ --after 01-schema
change-axi step set split-auth 02 --owns src/auth/,tests/auth/
change-axi dep split-auth 03 --on 01,02    # cycles are reverted
change-axi check split-auth --waves
change-axi status split-auth
change-axi                                 # on branch <slug>: that change's steps, ready list, next prompt
change-axi claim split-auth [step]         # start a step, print Owns/Docs/Goal/Work/Done when
change-axi done split-auth 01              # mark done, commit only tasks.md, warn outside Owns
change-axi start split-auth                # on main: in flight + commit + worktree
change-axi enter split-auth [step]         # start if needed, run the agent in the worktree (--print to only print)
change-axi enter                           # no slug: current change, the only in-flight change, or pick (TTY) / list (exit 1)
change-axi enter --list                    # active changes with worktree, branch state, in-flight steps
change-axi setup [--remove]                # managed plan-axi block in AGENTS.md
change-axi archive split-auth --dry-run    # then --commit; accepts the change's ADRs
change-axi finish split-auth [--dry-run] [--delete-branch]   # on main: archive if needed, ff-merge the branch, release the worktree, optionally delete the branch
```
In a worktree the PATH binaries are the main checkout's build. Smoke-test your own code with `node packages/change-axi/dist/bin/change-axi.js <args>` (after `npm run build`) or `npm run dev -w packages/change-axi -- <args>` (rebuilds, then runs). docs-axi: use the `dist` form.

## Agent config

`enter` runs the first match of: `[apply] agent` in `.plan-axi.toml` (repo, over user config at `~/.config/plan-axi/config.toml`), env `CHANGE_AXI_AGENT`, then the first of `pi`, `claude`, `codex`, `gemini`, `opencode` on PATH.

```toml
[apply]
agent = "pi {prompt}"    # placeholders: {prompt} (shell-quoted) {slug} {step} {path}
```

Without a TTY, `enter` prints the command instead of running it (`--run` overrides).

If branch `<slug>` already exists, `enter` recreates it when it holds no commits beyond the default branch, and switches to it (keeping the commits) when it does. If the comparison cannot be made, `enter` errors without deleting; inspect with `git log <base>..<slug>`, then delete or switch manually. Without a step, `enter` resumes the single in-flight step; zero or several in-flight steps give the plain `apply <slug>` prompt.
