# 07 - Add clean command

Owns: packages/change-axi/src/review/clean.ts, packages/change-axi/src/cli.ts, packages/change-axi/test/clean.test.ts
Docs: none

## Goal

`change-axi clean [slug]` closes finished step and review tabs for a change.

## Context

ADR-0008-run-launches-ready-steps-as-herdr-tabs said run never closes tabs; clean is the separate, explicit command that does. Step state is read from the change worktree. Closing a hunk tab loses unsent comments, so clean checks Viewer.comments first.

## Work

1. `src/review/clean.ts`: close `step <NN>` and `review step <NN>` tabs whose step is done and whose agent is not working. Tabs for steps not done, and tabs it does not recognise, stay.
2. `--reviews` also closes hunk review tabs; it refuses while user comments are pending unless `--force`. `--workspace` closes the whole workspace and implies `--reviews`, and refuses while any agent is working unless `--force`. `--print` lists what would close.
3. Output rows: tab, action (closed, kept), reason.
4. `clean.test.ts`: done vs not done, working agent kept, comment refusal, `--force`, `--workspace`, `--print`.

## Done when

npm test passes; `clean --print` lists exactly the tabs that would close and changes nothing.
