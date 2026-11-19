# Run a wave of steps in herdr tabs

## Why

Today the controller runs `change-axi enter` once per step, each in its own terminal, by hand, then reviews diffs and relays comments by hand. For a plan with parallel steps the human wants to say "run this wave", see which agents are working, review each repo's diff, send comments back, and close finished tabs. This is the human-in-the-loop crossover between plan-axi and firstmate-style crews, without a controlling agent, and it is one loop, so it is planned as one change.

## Context

Docs read: ADR-0004-plans-are-committed-on-main-steps-run-in-a-worktree (plans committed on main, steps in a worktree), ADR-0005-owns-lists-the-files-a-step-edits (`Owns` and parallel safety), ADR-0006-agent-launch-uses-a-command-template (launch template), ADR-0007-agent-profiles-and-step-tiers-extend-the-launch-template (profiles and tiers), `docs/domain/cli-quick-reference.md`, `docs/architecture/plan-workflow.md`. `run` reuses `resolveAgent` and `buildProfileCommand` from `packages/change-axi/src/agent.ts` (already built). Reference: firstmate `bin/backends/herdr.sh` places one tab per task in the launcher exact workspace (`HERDR_WORKSPACE_ID`, `tab create --workspace --cwd --label --no-focus`) and launches agents with `pane run`; herdr 0.9.5 docs/CLI reference and the herdr skill (`pane run`, `agent get|wait <pane-id>`).

## What changes

- `change-axi run <slug>` launches every ready step of the current wave, each in a new herdr tab under the controller's existing workspace, in the change's worktree (parallel steps share it; `Owns` is disjoint).
- Each tab runs the step's resolved profile command (same resolution as `enter`: `--agent`, step tier, config, env, autodetect) with prompt `apply <slug> <step>`, after marking the step started if it is not.
- `run` prints a status table (step, profile, tab, agent state) and stops. Re-running is idempotent: in-flight steps with a live tab are reported, done steps skipped, the next wave is launched only when the previous wave is done.
- Flags: `--dry-run`, `--only <steps>`, `--no-status`, `--agent <profile>`. Outside herdr (or without a TTY) `run` prints the commands instead of launching, like `enter`.
- `change-axi status` gains live fields when a backend is detected: an `agent` column, a `review: N comments pending` line and a `live:` line saying what was queried (`live: off (<reason>)` otherwise). `--no-live` skips the queries; `--fields` adds columns.
- `change-axi review` opens a hunk tab per leased repo worktree with something to review, against the branch creation commit. `change-axi feedback` lists your hunk comments and, with `--send`, tells the idle agent to address them. `change-axi clean` closes finished step and review tabs.
- Windows-platform repos (`platform = "windows"` in `[repos.<name>]`) get the git env hunk needs for a gitdir WSL cannot read; other repos are unaffected.
- `run` never archives, finishes or closes tabs; only `clean` closes tabs, and only when safe.

## Out of scope

Archive, finish or review automation by an agent (human review stays; later an automated reviewer or firstmate with no-mistakes). `wait` (block until a step finishes or an agent goes idle), `enter --ready`, auto-continue across waves, and a controlling agent: later changes. Separate worktrees per step. `herdr worktree`, remote machines, tmux/wezterm backends and viewers other than hunk (the backend and viewer interfaces leave room). Supervision, retries, answering blocked agents.

## Approach

A small `Backend` interface (`launch`, `status`, plus tab list and close for `clean`) in `src/run/`, with a herdr implementation and a print-only fallback. Launch = `herdr tab create --workspace $HERDR_WORKSPACE_ID --cwd <worktree> --label "<slug>/<step>" --no-focus`, parse `.result.tab.tab_id` and `.result.root_pane.pane_id` with JSON, then `herdr pane run <pane> "<command>"`. Status = `herdr agent get <pane>` (idle, working, blocked, done). The workspace id comes from the inherited environment and is verified with `herdr workspace get`; an unresolvable identity stops the run (never fall back to a label search). Spike in step 1: whether `herdr agent start` is better than `pane run` for readiness; default is `pane run`.
A parallel `Viewer` interface in `src/viewer/` wraps hunk (diff, user comment list, reload), with a fake hunk for tests. Commands share slug resolution (argument, workspace label, current branch, the only leased change; several candidates list and exit 1). Live status is additive and cheap by default: file state always, backend queries only when detected and with short timeouts.
Alternatives: (a) `herdr worktree create` - conflicts with treehouse; rejected. (b) typing the brief into a composer - unnecessary, the prompt is a launch argument. (c) a separate package - the commands need change state, so they live in change-axi. (d) separate plans for run and review - they share the backend and the state query, so one plan avoids building them twice.
Decision: ADR-0008-run-launches-ready-steps-as-herdr-tabs, widened to cover the viewer seam and `clean`.

## Steps

- `01-herdr-backend-and-launch-spike.md` - backend interface, herdr and print backends, fake-herdr tests, spike result
- `02-run-command.md` - `change-axi run` wave launch, idempotence, dry-run, status table
- `03-add-viewer-module-with-hunk-and-windows.md` - Viewer interface, hunk implementation, review base, Windows git env
- `04-show-live-agent-and-review-state-in-stat.md` - live agent and review state in `status`
- `05-add-review-command.md` - hunk tab per leased repo worktree
- `06-add-feedback-command.md` - list and send review comments
- `07-add-clean-command.md` - close finished step and review tabs
- `08-docs-adr-and-plan-apply-skill.md` - docs, ADR-0008-run-launches-ready-steps-as-herdr-tabs, plan-apply skill

## Acceptance

- `npm test` passes, using a fake `herdr` and a fake `hunk` on PATH that record calls and return JSON.
- In a herdr pane, `change-axi run <slug>` on a plan with a two-step wave opens two tabs labelled `<slug>/<step>` without moving focus, each running the resolved agent command in the worktree, and prints a status table.
- A second `run` does not open duplicate tabs for in-flight steps and does not start wave 2 until wave 1 is done. `run --dry-run` and a run outside herdr print the exact commands and change nothing.
- `status` shows the `agent` column and `live: herdr+hunk` in herdr, `live: off (not in herdr)` outside, and a `review:` line only when comments are pending.
- `review --print`, `feedback` and `clean --print` behave as their steps state; `clean` and `feedback --send` refuse unsafe cases without `--force`.
- Manual: run a real two-step wave with a pi `small` profile in herdr, review it in hunk, send a comment, and clean the tabs.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: `run`, live `status`, `review`, `feedback`, `clean`
- `README.md` - update: run a wave, review
- `docs/architecture/plan-workflow.md` - update: wave review stop, review loop
- `docs/decisions/0008-run-launches-ready-steps-as-herdr-tabs.md` - update: viewer seam and clean
- `skills/plan-apply/SKILL.md` - update: `run` for parallel waves, review loop

## Risks and open questions

- Herdr state detection for pi started via `pane run` should work but must be verified in the spike; the fallback is `agent start`.
- `agent get <pane>` output shape is not pinned in docs; parse defensively and treat unknown as `unknown`.
- Several agents committing in one worktree can race on git index locks; step commits already limit to `Owns` paths, but watch in the manual test.
- hunk session and comment CLI shapes need a spike in step 03; a failing query degrades to `live: off`, never an error.
- Windows worktree git env goes through WSL git over `/mnt`, which is slow and may touch the Windows index; verify in the manual test.
- Eight steps is the largest plan size; if the spike changes the backend shape, split the review loop (steps 03-07) into its own change.
