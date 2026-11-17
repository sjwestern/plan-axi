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
docs-axi search billing --repo api            # read another repo's docs (repo with docs = "..." in [repos.<name>])
docs-axi adr list --all-repos                 # this repo plus every such repo, one result per repo (read commands only)
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
change-axi idea "dark mode toggle" --kind chore --priority 1 --repo web   # capture an unplanned item (idea|bug|chore; P0 highest)
change-axi backlog                         # list unplanned items by priority, then age
change-axi new dark-mode-toggle            # adopt an unplanned item in place (title optional, body seeds Why)
change-axi new add-dark-mode --from dark-mode-toggle   # adopt under a new slug, carrying fields and blocked-by
change-axi write split-auth proposal --section Why --body "Slow builds."
change-axi step add split-auth "Extract tokens" --owns src/auth/ --after 01-schema
change-axi step set split-auth 02 --owns src/auth/,tests/auth/
change-axi step set split-auth 02 --tier small     # small|standard|deep|none; also `step add --tier`
change-axi guidance                                # tier rules from [propose.tiers] and the profile per tier
change-axi config                                  # show effective profiles, tiers, rules, agent, commit style
change-axi config --verify                         # validate all config, then live-check profiles; writes nothing
change-axi dep split-auth 03 --on 01,02    # cycles are reverted
change-axi check split-auth --waves
change-axi status split-auth
change-axi where split-auth                # path and state: active, archived or backlog
change-axi                                 # on branch <slug>: that change's steps, ready list, next prompt
change-axi claim split-auth [step]         # start a step, print Owns/Docs/Goal/Work/Done when
change-axi done split-auth 01              # mark done, commit only tasks.md, warn outside Owns
change-axi commit-plan [split-auth]        # human: commit the plan as docs(plan): propose <slug> (--reason "<why>" for amendments, --dry-run)
change-axi start split-auth                # on main: in flight + commit + worktree (refuses unplanned items: propose first)
change-axi enter split-auth [step]         # start if needed, run the agent in the worktree (--print to only print)
change-axi enter                           # no slug: current change, the only in-flight change, or pick (TTY) / list (exit 1)
change-axi enter --list                    # active changes with worktree, branch state, in-flight steps
# inside herdr, enter also renames the current tab to the slug (best effort)
change-axi setup [--remove]                # managed plan-axi block in AGENTS.md
change-axi archive split-auth --dry-run    # then --commit; accepts the change's ADRs
change-axi finish split-auth [--dry-run] [--delete-branch]   # on main: archive if needed, ff-merge the branch, release the worktree, optionally delete the branch; safe to rerun if the return got stuck (editor still open)
```
Multi-repo changes: configure `[repos.<name>]` and list the repos in the proposal header; `start`/`enter` then lease a worktree per repo and `finish` merges them all, plan repo last.

```toml
[repos.api]
path = "~/projects/org/api"   # home-relative; ~ is the Windows profile for a windows repo under WSL
platform = "windows"          # optional; only under WSL, ignored elsewhere
git = "git.exe"               # optional command overrides
treehouse = "treehouse.exe"
docs = "docs"                   # optional; relative docs dir: plans may cite this repo's ADRs (see ADR references)
```

```text
Repos: api@release/2.1, web          # proposal header; no @base = repo default branch
Owns: api:src/auth/, src/docs/       # <repo>: prefix for another repo; no prefix = plan repo
```

`change-axi finish <slug> --dry-run` prints a table (repo, base, ahead, behind, state, detail). State is `ready`, `merged`, `rebase-needed` (detail is the exact rebase command), `dirty`, `wrong-branch` or `unavailable`. The real finish refuses until every repo is ready, and a rerun skips repos already merged.

`finish` also prints a `returned` table with one row per leased worktree (repo, path, slot, status): the plan repo first (`plan`), then each extra repo, with WSL or Windows paths as the repo sees them. Status is `returned`, `not returned` (also a warning), `planned` (dry run) or `none found`.

In a worktree the PATH binaries are the main checkout's build. Smoke-test your own code with `node packages/change-axi/dist/bin/change-axi.js <args>` (after `npm run build`) or `npm run dev -w packages/change-axi -- <args>` (rebuilds, then runs). docs-axi: use the `dist` form.

## Referring to changes

Refer to a change from another change as `change:<slug>`, never by path (archive moves it). `change-axi where <slug>` resolves it; `show`, `sections` and `status` also read archived changes. `change-axi check` errors on an unknown slug and warns on `specs/changes/` paths. Docs and ADRs do not refer to changes: `docs-axi check` warns (`DOC_LINKS_TO_CHANGE`).

## ADR references

Cite ADRs as `ADR-NNNN-slug` (number and slug of an existing file). `docs-axi check` and `change-axi check` error on bare refs (`ADR 7`) and unknown or mismatched refs (`ADR_REF_BARE`, `ADR_REF_UNKNOWN`). `change-axi commit-plan` and `finish` also fail on duplicate ADR numbers, or a number already used by another file on the default branch (`ADR_DUPLICATE_NUMBER`, `ADR_NUMBER_TAKEN`), and print the fix: `docs-axi adr renumber <ref>` for clashes, `docs-axi adr fix-refs` for refs; then retry.

A plan repo can cite ADRs that live in other repos: set `docs` on those `[repos.<name>]` tables. `change-axi check` and the commit-plan and finish guards then resolve refs against the plan repo plus each such repo, read from its configured checkout (see ADR-0015-adr-refs-resolve-across-configured-repos). Qualify a ref as `repo:ADR-NNNN-slug` to look only in that repo. An unqualified ref whose number and slug exist in several repos is `ADR_REF_AMBIGUOUS`. An unreadable source repo gives the warning `ADR_SOURCE_UNAVAILABLE` and is skipped. Numbering, clash guards, `renumber` and `fix-refs` stay per repo, and `docs-axi check` resolves them the same way (ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos). docs-axi list, search, show, sections and adr list or search read another repo with `--repo <name>`; `--all-repos` runs list, search and adr list or search everywhere. Writes never cross repos.

Upgrade note: existing repos run `docs-axi adr fix-refs` once, because bare refs are now errors.

## Commit format

Tool commits are `chore(plan): start <slug>`, `chore(plan): done <slug> <step-id>` and `chore(plan): archive <slug>`; `commit-plan` writes `docs(plan): propose <slug>`. Each has a `Change: <slug>` trailer. Defaults shown; override under `[commit]` (repo over user config):

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

Profiles bundle a harness, model and effort; tiers map a step's `Tier:` to a profile. `enter` resolves the agent in this order: `--agent <name>`, the step's tier (`[apply.tiers]`), `[apply] agent`, env, autodetect. The output names the source, e.g. `small (tier small -> small)`.

Before launching a profile, `enter` live-checks its model and effort (preflight). An invalid result blocks the launch with the field, value and a fix hint; a skipped result (harness not on PATH, output not parsable) only warns. With `--print` or no TTY, invalid results are warnings. `--no-verify` skips the check. Fix an invalid profile with `change-axi config --profile <name> ...`; re-check with `change-axi config --verify`.

Set this up with `change-axi config` (repo `.plan-axi.toml`, or `--user` for personal model choices). It validates before writing and keeps comments:

```sh
change-axi config --profile small --harness pi --model provider/id --effort low --tier small=small
change-axi config --rule standard="db migrations" --default-tier small
change-axi config --remove-profile small --unset-tier small
change-axi config --verify [--profile small]
```

`config --verify` validates the user and repo config files, then live-checks profiles. It prints `problems[n]{file,key,severity,message}` first (`problems: none` when clean), then one row per profile. It checks:

- each file alone: syntax, key names, value types, `[commit]` values, tier names, repo keys and platform, and `{prompt}` in `apply.agent` and profile `command` templates;
- the merged view: tiers map to a profile defined in either file, repo `path` present in either file, profiles have `harness` or `command`;
- the `[docs]` layout (docs-axi rules), reported for every problem rather than only the first.

Every problem names the file holding the key. An error (bad value, syntax error, `{prompt}` missing, undefined profile) makes the exit code 1; a warning (unknown key with a did-you-mean hint, unknown `{placeholder}`) does not. An invalid profile also exits 1; a missing binary is `skipped`. `--profile <name>` limits only the live checks; all config is still validated, and an unknown name fails. Live checks are skipped when a file has a syntax error.

Structural errors (unknown tier, undefined profile, profile without harness or command) and an invalid pi model or effort fail and leave the file unchanged; `--force` writes past an invalid model or effort. A missing harness is a warning. `--model` must be `provider/id`. Hand-editing the TOML is equivalent; check it with `change-axi config --verify`:

```toml
[apply.agents.small]
harness = "pi"          # pi is the only built-in adapter; or set command = "... {prompt}"
model = "provider/id"   # pi --model
effort = "low"          # pi --thinking

[apply.tiers]           # tier -> profile name
small = "small"

[propose.tiers]         # plain-language rules read by plan-propose via `change-axi guidance`
standard = ["changes that touch db migrations"]
[propose]
default_tier = "small"  # optional
```

`change-axi check` warns `TIER_UNKNOWN` (not small/standard/deep) and `TIER_UNMAPPED` (no `[apply.tiers]` entry, or an undefined profile).

Without a TTY, `enter` prints the command instead of running it (`--run` overrides).

If branch `<slug>` already exists, `enter` recreates it when it holds no commits beyond the default branch, and switches to it (keeping the commits) when it does. If the comparison cannot be made, `enter` errors without deleting; inspect with `git log <base>..<slug>`, then delete or switch manually. Without a step, `enter` resumes the single in-flight step. With none in flight, a single ready step is picked, so its tier profile applies; several ready steps are listed (`ready[]{step,tier,profile}`) and nothing launches until you run `enter <slug> <step>`.
