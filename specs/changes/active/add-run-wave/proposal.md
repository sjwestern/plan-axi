# Run a wave of steps in herdr tabs

## Why

Today the controller runs `change-axi enter` once per step, each in its own terminal, by hand. For a plan with parallel steps the human wants to say "run this wave", watch the agents work in herdr, then review. This is the human-in-the-loop crossover between plan-axi and firstmate-style crews, without a controlling agent.

## Context

Docs read: ADR 0004 (plans committed on main, steps in a worktree), ADR 0005 (`Owns` and parallel safety), ADR 0006 (launch template), `docs/domain/cli-quick-reference.md`, `docs/architecture/plan-workflow.md`. Depends on change `add-agent-profiles` (profiles, tiers, `buildProfileCommand`, `resolveAgent`), which must be applied first. Reference: firstmate `bin/backends/herdr.sh` places one tab per task in the launcher's exact workspace (`HERDR_WORKSPACE_ID`, `tab create --workspace --cwd --label --no-focus`) and launches agents with `pane run`; herdr 0.9.5 docs/CLI reference and the herdr skill (`pane run`, `agent get|wait <pane-id>`).

## What changes

- `change-axi run <slug>` launches every ready step of the current wave, each in a new herdr tab under the controller's existing workspace, in the change's worktree (parallel steps share it; `Owns` is disjoint).
- Each tab runs the step's resolved profile command (same resolution as `enter`: `--agent`, step tier, config, env, autodetect) with prompt `apply <slug> <step>`, after marking the step started if it is not.
- `run` prints a status table (step, profile, tab, agent state) and stops. Re-running is idempotent: in-flight steps with a live tab are reported, done steps skipped, the next wave is launched only when the previous wave is done.
- Flags: `--dry-run` (print the plan and commands), `--only <steps>`, `--no-status` (skip the state query), `--agent <profile>` override for all launched steps.
- Outside herdr (`HERDR_ENV` unset, or no resolvable workspace) or without a TTY, `run` prints the commands instead of launching, like `enter`.
- `run` never archives, finishes or closes tabs.

## Out of scope

Archive, finish or review automation (human review stays; later an automated reviewer or firstmate with no-mistakes). Auto-continue across waves. Separate worktrees per step. `herdr worktree`, remote machines, tmux/wezterm backends (the backend interface leaves room). Supervision, retries, answering blocked agents.

## Approach

A small `Backend` interface (`launch`, `status`) in `src/run/`, with a herdr implementation and a print-only fallback. Launch = `herdr tab create --workspace $HERDR_WORKSPACE_ID --cwd <worktree> --label "<slug>/<step>" --no-focus`, parse `.result.tab.tab_id` and `.result.root_pane.pane_id` with JSON, then `herdr pane run <pane> "<command>"`. Status = `herdr agent get <pane>` (herdr detects pi in the pane and reports idle/working/blocked/done). The workspace id comes from the inherited environment and is verified with `herdr workspace get`; an unresolvable identity stops the run (firstmate rule: never fall back to a label search). Spike in step 1: whether `herdr agent start <name> --kind pi --pane <pane> -- <args>` is better than `pane run` for readiness; default is `pane run` because the command is identical to what `enter` builds and needs no agent names.
Alternatives: (a) `herdr worktree create` - makes a new grouped workspace and its own checkout, conflicting with treehouse; rejected. (b) firstmate-style typing of the brief into a composer - unnecessary, the prompt is a launch argument. (c) a separate crew-axi package - deferred until supervision or retries are needed.
Decision: new ADR for the herdr-first launch backend.

## Steps

- `01-herdr-backend-and-launch-spike.md` - backend interface, herdr and print backends, fake-herdr tests, spike result
- `02-run-command.md` - `change-axi run` wave launch, idempotence, dry-run, status table
- `03-docs-adr-and-plan-apply-skill.md` - docs, ADR 8, plan-apply skill

## Acceptance

- `npm test` passes, using a fake `herdr` script on PATH that records calls and returns JSON.
- In a herdr pane, `change-axi run <slug>` on a plan with a two-step wave opens two tabs labelled `<slug>/<step>` in the current workspace without moving focus, each running the resolved agent command in the worktree, and prints a status table.
- A second `run` does not open duplicate tabs for in-flight steps and does not start wave 2 until wave 1 is done.
- `run --dry-run` and a run outside herdr print the exact herdr and agent commands and change nothing.
- Manual: run a real two-step wave with a pi `small` profile in herdr under wezterm.

## Docs impact

- `docs/domain/cli-quick-reference.md` - update: `run`
- `README.md` - update: run a wave
- `docs/architecture/plan-workflow.md` - update: wave review stop
- `docs/decisions/0008-run-launches-ready-steps-as-herdr-tabs.md` - new ADR
- `skills/plan-apply/SKILL.md` - update: `run` for parallel waves

## Risks and open questions

- Herdr state detection for pi started via `pane run` should work (pi is a supported kind) but must be verified in the spike; the fallback is `agent start`.
- `agent get <pane>` output shape is not pinned in docs; parse defensively and treat unknown as `unknown`.
- Several agents committing in one worktree can race on git index locks; step commits already limit to `Owns` paths, but watch in the manual test.
- Needs `add-agent-profiles` applied first.
