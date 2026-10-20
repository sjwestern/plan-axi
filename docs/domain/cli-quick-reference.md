---
title: CLI quick reference
summary: One-screen reference for docs-axi and change-axi commands with examples
---

# CLI quick reference

Run `<tool> <command> --help` for flags.

## docs-axi

```sh
docs-axi                                   # dashboard: counts, ADR statuses, hints
docs-axi search billing invoice            # matched column is N/M terms
docs-axi search billing invoice --all      # only docs with every term
docs-axi adr                               # ADR counts by status
docs-axi adr list --status accepted        # all|proposed|accepted|superseded|deprecated
docs-axi adr list --full                   # adds decision text, superseded-by
docs-axi adr search cache --all
docs-axi adr renumber ADR-0007-use-postgres   # next free number; rewrites refs (--to <n>)
docs-axi adr fix-refs                      # rewrite bare ADR refs to ADR-NNNN-slug
docs-axi sections domain/billing           # headings and refs
docs-axi show domain/billing --section Refunds
printf 'text' | docs-axi write domain/billing --section Refunds
docs-axi append domain/billing --section "Open questions" --body "- Tax?"
docs-axi new domain "Billing" --summary "Invoice rules" --body-file -
docs-axi adr add "Use Postgres" --summary "Why jobs live in Postgres" \
  --context "..." --decision "..." --consequences "..."
docs-axi update 7 --status accepted
docs-axi check
docs-axi config                            # effective layout: dir, sections, guides
docs-axi config --sections guides,reference,adr --adr adr
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
change-axi where split-auth                # path and state: active, archived or backlog
change-axi                                 # on branch <slug>: that change's steps, ready list, next prompt
change-axi claim split-auth [step]         # start a step, print Owns/Docs/Goal/Work/Done when
change-axi done split-auth 01              # mark done, commit only tasks.md, warn outside Owns
change-axi commit-plan [split-auth]        # human: commit the plan as docs(plan): propose <slug> (--reason "<why>" for amendments, --dry-run)
change-axi start split-auth                # on main: in flight + commit + worktree
change-axi enter split-auth [step]         # start if needed, run the agent in the worktree (--print to only print)
change-axi enter                           # no slug: current change, the only in-flight change, or pick (TTY) / list (exit 1)
change-axi enter --list                    # active changes with worktree, branch state, in-flight steps
change-axi setup [--remove]                # managed plan-axi block in AGENTS.md
change-axi archive split-auth --dry-run    # then --commit; accepts the change's ADRs
change-axi finish split-auth [--dry-run] [--delete-branch]   # on main: archive if needed, ff-merge the branch, release the worktree, optionally delete the branch; safe to rerun if the return got stuck (editor still open)
```
In a worktree the PATH binaries are the main checkout's build. Smoke-test your own code with `node packages/change-axi/dist/bin/change-axi.js <args>` (after `npm run build`) or `npm run dev -w packages/change-axi -- <args>` (rebuilds, then runs). docs-axi: use the `dist` form.

## Referring to changes

Refer to a change from another change as `change:<slug>`, never by path (archive moves it). `change-axi where <slug>` resolves it; `show`, `sections` and `status` also read archived changes. `change-axi check` errors on an unknown slug and warns on `specs/changes/` paths. Docs and ADRs do not refer to changes: `docs-axi check` warns (`DOC_LINKS_TO_CHANGE`).

## ADR references

Cite ADRs as `ADR-NNNN-slug` (number and slug of an existing file). `docs-axi check` and `change-axi check` error on bare refs (`ADR 7`) and unknown or mismatched refs (`ADR_REF_BARE`, `ADR_REF_UNKNOWN`). `change-axi commit-plan` and `finish` also fail on duplicate ADR numbers, or a number already used by another file on the default branch (`ADR_DUPLICATE_NUMBER`, `ADR_NUMBER_TAKEN`), and print the fix: `docs-axi adr renumber <ref>` for clashes, `docs-axi adr fix-refs` for refs; then retry.

Upgrade note: existing repos run `docs-axi adr fix-refs` once, because bare refs are now errors.

## Commit format

Tool commits are `chore(plan): start change`, `chore(plan): done <step-id>` and `chore(plan): archive change`; `commit-plan` writes `docs(plan): propose <slug>`. Each has a `Change: <slug>` trailer. Defaults shown; override under `[commit]` (repo over user config):

```toml
[commit]
type = "chore"        # start, done, archive
plan_type = "docs"    # commit-plan
scope = "plan"        # "" drops the scope
trailer = "Change"    # "" drops the trailer
```

A rejecting commit hook fails the command with `commit rejected` and the hook output.

## Agent config

`enter` runs the first match of: `[apply] agent` in `.plan-axi.toml` (repo, over user config at `~/.config/plan-axi/config.toml`), env `CHANGE_AXI_AGENT`, then the first of `pi`, `claude`, `codex`, `gemini`, `opencode` on PATH.

```toml
[apply]
agent = "pi {prompt}"    # placeholders: {prompt} (shell-quoted) {slug} {step} {path}
```

Without a TTY, `enter` prints the command instead of running it (`--run` overrides).

If branch `<slug>` already exists, `enter` recreates it when it holds no commits beyond the default branch, and switches to it (keeping the commits) when it does. If the comparison cannot be made, `enter` errors without deleting; inspect with `git log <base>..<slug>`, then delete or switch manually. Without a step, `enter` resumes the single in-flight step; zero or several in-flight steps give the plain `apply <slug>` prompt.
