# plan-axi design memory

Lightweight plan -> apply -> archive workflow. Inspired by OpenSpec, differs: no delta-spec merge, no checkbox tasks.

## Decisions
- Repo: npm workspaces. Packages: `docs-axi`, `change-axi` (later). `skills/` holds agent skills. tasks-axi (external, pin version) owns task state/deps.
- Flow: explore (skill, read-only, reads docs) -> propose (skill) -> review (human reads diff) -> apply (skill) -> archive (skill).
- Plans in `specs/changes/active/<slug>/` (`proposal.md`, `NN-*.md` step files with `Owns:`, `tasks.md` managed ONLY by tasks-axi `--file`). Archive: `specs/changes/archived/YYYY-MM-DD-<slug>/`.
- Repo-level `backlog.md` (tasks-axi default): one task per change. apply starts it on main + commits. Plan committed on main before apply.
- Step state on feature branch in treehouse worktree. Archive on branch (or main if merged).
- Parallel features = separate worktrees. Parallel steps = same worktree, `Owns:` overlap check, commit only own paths.
- Docs: `docs/domain`, `docs/architecture`, `docs/decisions` (ADRs). Edited directly, no merge step. Proposal has Docs impact section. docs-axi owns frontmatter + generated index in `docs/README.md`.
- explore/propose must read docs (index first) as context.

## tasks-axi facts (v0.2.6)
- Accepts dependency cycles silently -> change-axi `check` must catch.
- `--report` restricted to data/<id>/report.md; use `--body "Spec: NN-x.md"`.
- Flags must come after command. `--file` per backlog. Parallel writes serialized OK (12x12 test).
- `mv` moves tasks between files atomically.

## More tasks-axi facts (verified)
- `start` on an already-started task prints `already: true` (use as claim check). `start` on a DONE task moves it back to in flight - never do it.
- `done` auto-prunes done tasks beyond `done_keep` (default 10) into `done-archive.md` next to the task file. Repo `.tasks.toml` (read from CWD) `[markdown] done_keep = 1000` avoids it; check-plan.mjs also reads done-archive.md.
- `list` shows only ACTIVE blockers in `blocked_by`; `--fields blocked_by,body` works; no `--json` on list. `--kind` is free-form (we use `change` for backlog entries).
- Ambient config can redirect: TASKS_AXI_FILE, ~/.tasks-axi/config.toml -> always pass `--file`.
- treehouse: `treehouse get --lease -b <branch>` prints worktree path to stdout, banners to stderr; `treehouse return <path>` releases.
- Review gate task dropped: committing the plan on main is the approval; apply preflight checks plan is committed + clean.

## Status (2026-10-15) - resume here
Built and committed (3 commits on `main`, local-only, no remote, nothing published):
- `packages/docs-axi` v0.1.0 - DONE, 23 vitest tests pass, tested on Linux only. Commands: (home), init, list, search, show, new, adr, update, supersede, index, check. Doc frontmatter: title, summary, tags, status (ADRs), supersedes/superseded-by. Index is generated between markers in docs/README.md. Run: `npm install && npm run build && npm test`; `node packages/docs-axi/dist/bin/docs-axi.js`.
- `skills/plan-{explore,propose,apply,archive}/SKILL.md` - v0, prompt-only, NOT yet used on a real repo. Templates in `skills/plan-propose/templates/` (proposal.md, step.md). Interim checker `skills/plan-propose/scripts/check-plan.mjs` (cycles, Spec/step-file links, Owns overlap, `--waves`); apply/archive reach it as sibling skill dir.
- Scratch-repo dry run of propose -> apply -> archive command sequence passed (real tasks-axi + docs-axi). treehouse step NOT run.
NOT built: `packages/change-axi`, CI, Windows/macOS verification, changesets config, publishing, skill install/symlink step.

## Next steps (in order)
1. User supplies a real test repo + small change. Run explore -> propose -> (user commits plan on main) -> apply (launch + execute in treehouse worktree) -> archive. Record every place the agent slipped; tune skill prompts.
2. Verify `treehouse get --lease -b <slug>` + `treehouse return <path>`; check treehouse Windows builds (decides whether CLI may call it, else keep as skill text).
3. Build `packages/change-axi` driven by observed slips. Planned commands: `check` (promote check-plan.mjs; add docs-impact + gate checks), `new <slug>` (scaffold from templates, slug validation, collision check), `archive <slug>` (branch, or main if merged; date-prefixed move), `status` (home view: aggregate in-flight/ready across active changes + worktrees, flag stale), `deps set|show` (declarative blocker edit with cycle validation, wave view), `next`/`claim` (overlap-aware; claim uses `start` -> `already: true`), `prompt <slug> <id>` (agent hand-off text), `apply` preflight (on main, plan committed). Shell out to `tasks-axi` (never parse tasks.md). No dependency on docs-axi (skill runs `docs-axi check`).
4. CI matrix (ubuntu/windows/macos), changesets config, pin versions in skills, decide install path for skills (symlink to ~/.agents/skills or `npx skills add`).
5. Report upstream to kunchenguid/tasks-axi: dependency cycles accepted silently; `start` on done task reopens it.

## Decisions still open
- Whether apply hands off via printed commands (current) or CLI calls treehouse.
- Within-change parallel steps share one worktree and one tasks.md (works: tasks-axi serializes writes; only commit-own-paths rule needed). Revisit if conflicts appear.
- Name/placement of `Owns:` convention - only valuable if actually written reliably; evaluate in step 1.
- Archive on branch (preferred) vs main-after-merge: both documented in plan-archive.

## Open / verify
- tasks-axi `start` on already-started task reporting (for `claim`).
- treehouse `lease` behavior, Windows builds.
- Byte-stable output cross-platform: `/` in paths, LF, locale-independent sort.
