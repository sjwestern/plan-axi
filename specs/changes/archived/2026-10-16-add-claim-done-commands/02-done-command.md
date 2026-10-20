# 02 - Done command

Owns: packages/change-axi/src/done.ts, packages/change-axi/src/cli.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/done.test.ts
Docs: none

## Goal

`change-axi done <slug> <step>` finishes a step and commits only tasks.md, warning on writes outside Owns.

## Context

ADR-0005-owns-lists-the-files-a-step-edits: Owns is the write set. Baseline = last commit touching tasks.md (`git log -1 --format=%H -- <tasks.md>`) or `--since`. Use a commit pathspec so other staged files are untouched. Dirty tree outside tasks.md is allowed (parallel steps).

## Work

1. `src/done.ts`: resolve step, require it is started (else error), run `tasks-axi done`, `git add` + `git commit -m 'done <step>' -- <tasks.md>`.
2. Compute changed paths since baseline (`git diff --name-only <base>..HEAD`), match against the step Owns (reuse glob logic from check.ts, export if needed), emit `warnings` list.
3. Register in cli.ts; `test/done.test.ts`: clean done commit contains only tasks.md; out-of-Owns edit yields warning; unstarted step errors.

## Done when

`npm test -w packages/change-axi` passes including done.test.ts; a manual done in a temp repo yields a commit whose `git show --stat` lists only tasks.md.
