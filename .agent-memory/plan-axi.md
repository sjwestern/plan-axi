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

## Open / verify
- tasks-axi `start` on already-started task reporting (for `claim`).
- treehouse `lease` behavior, Windows builds.
- Byte-stable output cross-platform: `/` in paths, LF, locale-independent sort.
