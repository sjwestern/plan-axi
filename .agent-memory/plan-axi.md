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

## Status (2026-10-15, superseded by "Next steps" below)
Built and committed (3 commits on `main`, local-only, no remote, nothing published):
- `packages/docs-axi` v0.1.0 - DONE, 23 vitest tests pass, tested on Linux only. Commands: (home), init, list, search, show, new, adr, update, supersede, index, check. Doc frontmatter: title, summary, tags, status (ADRs), supersedes/superseded-by. Index is generated between markers in docs/README.md. Run: `npm install && npm run build && npm test`; `node packages/docs-axi/dist/bin/docs-axi.js`.
- `skills/plan-{explore,propose,apply,archive}/SKILL.md` - v0, prompt-only, NOT yet used on a real repo. Templates in `skills/plan-propose/templates/` (proposal.md, step.md). Interim checker `skills/plan-propose/scripts/check-plan.mjs` (cycles, Spec/step-file links, Owns overlap, `--waves`); apply/archive reach it as sibling skill dir.
- Scratch-repo dry run of propose -> apply -> archive command sequence passed (real tasks-axi + docs-axi). treehouse step NOT run.
NOT built: `packages/change-axi`, CI, Windows/macOS verification, changesets config, publishing, skill install/symlink step.

## Built since (2026-10-16, after first real trial)
- `scripts/install-skills.mjs` (`npm run skills:install|uninstall`): symlinks `skills/*` into `~/.agents/skills` (pi reads it). Idempotent, refuses non-link conflicts.
- `check-plan.mjs <slug|dir>`: accepts a slug (git root, then cwd). New errors: BAD_SLUG, SLUG_ARCHIVED, SLUG_DONE (tasks-axi `add` of an existing id is a silent no-op, even if done), OWNS_TOOL_DIR (only when proposal.md does not name the path).
- `Owns:` = files a step EDITS (write set for overlap checks). Read-only context goes in `Docs:`/Context. Tool dirs (.agents, .pi, .claude...) may be owned only if the proposal names them.
- docs-axi config: `~/.config/plan-axi/config.toml` + repo `.plan-axi.toml` (`[docs] ignore`, `[docs.map]`). Default ignores: dot-entries, node_modules, _build, _site, site, dist, build.
- docs-axi indexes EVERYTHING under docs/ that is not ignored. Files outside domain/architecture/decisions go under an "Other" index section, in place (title/first sentence derived, file not edited). Nothing outside docs/ is ever indexed. Other docs are not style-checked; mapped docs' style issues are warnings.
- `docs-axi migrate [--plan f.json] [--apply] [--force]` + skill `plan-migrate-docs` (separate from plan work). Actions: move | keep (in place, frontmatter added, Other) | ignore. Rewrites relative links in all docs (incl. ignored), `git mv`, reindex, reports (does not edit) references outside docs/.

## Trial log: example repo (plan-propose, then plan-migrate-docs by a separate agent; real names in private/example-repo-trial.md, gitignored)
Real gaps found (fix status):
1. FIXED: `migrate --plan f` (dry run) overwrote an existing edited plan file; agent applied the unreviewed proposal and had to revert. Now an existing plan is never overwritten (`--force` regenerates), dry run validates + shows it.
2. FIXED: placeholder summaries. Heuristic summary = first sentence, falls back to title; agent left 9 sibling docs with the same prefix "Specification for X: <title>". Skill said to rewrite weak ones but it is only advice. Now: `weakSummaries()` flags summary == title, identical text on 2+ docs, same prefix on 3+ docs, `Status:`/`Note:`/`Authority:`/`Purpose:`/... lead-ins; dry run shows reason per doc; `--apply` refuses (`--allow-weak-summaries` overrides); skill step 4 says read each doc and write a real description. On the pre-migration example repo it flags 21 of 40 and refuses.
3. FIXED (warnings): `docs-axi check` skipped link checks for docs outside the layout (Other), so pre-existing dead links (8x to one deleted file) only surfaced after migration. Check should report broken links for Other docs too (warning).
4. OPEN: plan-propose put Docs in pre-layout paths (e.g. docs/domain.md) - outside the layout, so Docs impact was not validated by docs-axi. Fine now after migrate; skill should recommend migrate first when docs-axi shows Other docs.
5. FIXED (skill text): after `git mv` the index has renames staged but reference fixes unstaged; commit skill must stage explicitly. Not a bug, note for apply/commit.
6. NOT gaps (deliberate, user decisions): `reference/original-scope/` ignored (AGENTS.md rule, agent asked correctly); `QUESTIONS.md` ignored (working list). Asset folders next to docs: no support needed.
7. docs-axi mixed line endings in an existing docs/README.md get normalized to the dominant EOL on first write (noisy diff). OPEN, low.

## Next steps (resume here, as of 2026-10-16)
Uncommitted in plan-axi: scripts/install-skills.mjs, check-plan slug/ownership checks, docs-axi config + Other + migrate + weak-summary gate (37 tests pass), skills `plan-migrate-docs` + edits. Commit these first (group: skills install; check-plan; docs-axi config/other; docs-axi migrate; skills/memory).
Example repo state: docs migration applied but NOT committed (renames staged, outside-ref edits unstaged); 8 dead links to one deleted file remain (decide: remove in separate commit). The example plan is already committed on main (its docs paths updated by migration, uncommitted).
1. Commit the example repo migration (stage explicitly: moves + .plan-axi.toml; outside refs; optional dead-link cleanup). Re-run `docs-axi check` + `check-plan.mjs <slug>`.
2. Trial plan-apply and plan-archive on the example plan with a separate agent: verify `treehouse get --lease -b <slug>` / `treehouse return`, claim via `start` -> `already: true`, Owns overlap behavior, archive on branch. Record slips here.
3. Verify the migrate skill again with a fresh agent on a different repo or after `git checkout` of the pre-migration state (check summaries gate, `--plan` review flow).
4. Build `packages/change-axi` driven by observed slips (see list in older notes: check, new, archive, status, deps, next/claim, prompt, apply preflight). Promote check-plan.mjs into `change-axi check`.
5. CI matrix (ubuntu/windows/macos), changesets, pin versions in skills (docs-axi is not published: skills fall back to `npx docs-axi@0.1.0` which will not work yet), publish docs-axi.
6. Low: preserve mixed line endings in docs/README.md; report upstream tasks-axi issues (silent cycles, `start` on done task reopens, `add` on existing id is a silent no-op even if done).
7. Open questions: apply hands off via printed commands or CLI calls treehouse; `Owns:` naming; archive on branch vs main.

## Decisions still open
- Whether apply hands off via printed commands (current) or CLI calls treehouse.
- Within-change parallel steps share one worktree and one tasks.md (works: tasks-axi serializes writes; only commit-own-paths rule needed). Revisit if conflicts appear.
- Name/placement of `Owns:` convention - only valuable if actually written reliably; evaluate in step 1.
- Archive on branch (preferred) vs main-after-merge: both documented in plan-archive.

## Open / verify
- tasks-axi `start` on already-started task reporting (for `claim`).
- treehouse `lease` behavior, Windows builds.
- Byte-stable output cross-platform: `/` in paths, LF, locale-independent sort.

## Update 2026-10-17: section editing + change-axi v0.1
- docs-axi: `sections`, `show --section [--tree]`, `write`, `append` (stdin/--body/--body-file), `new --body/--body-file -`. Pure logic in `src/sections.ts` + `src/sectionedit.ts`; exported to other packages as `docs-axi/lib/<module>` (no .js ext). Section = heading + text to next heading (own) or next same/higher heading (`--tree`). Refs: `Heading`, `Parent/Child`, `Heading#N`. Fences ignored; setext headings not supported.
- change-axi (packages/change-axi): `new`, `spec`, `step add|set`, `dep --on|--off` (reverts cycles), `sections/show/write/append <slug> <proposal|NN>`, `check` (port of check-plan.mjs + EMPTY/MISSING_SECTION, STEP_NOT_LISTED), `status`. Required sections live in `src/spec.ts` (single source; templates dir removed). Shells out to tasks-axi (`TASKS_AXI` env override, npx fallback).
- Skills propose/apply/archive/explore updated to use these; `check-plan.mjs` and templates removed. Build order matters: docs-axi before change-axi (root `npm run build` does it).
- NOT built: change-axi `archive`, apply preflight/`next`/`claim`/`prompt`, `step rm`, CI, publishing (skills fall back to `npx change-axi@0.1.0`, unpublished). Not yet trialled by a real agent on a real plan (example repo mid-planning with old skills).
- 2026-10-17 later: `change-axi archive <slug> [--dry-run] [--commit] [--skip-docs-check]` built (src/archive.ts): branch/main-after-merge check, clean tree, tasks done, plan check, Docs impact (backticked .md paths; ADRs exempt from touched check, touched = changed since the commit that added proposal.md), accepts proposed ADRs listed in Docs impact, git mv, backlog done, optional commit. `docs-axi adr --context/--decision/--consequences` added. Repo now dogfoods docs/ (5 ADRs). Remaining: apply preflight/next/claim, step rm, ADR section checks, CI/publish, real-agent trial.
