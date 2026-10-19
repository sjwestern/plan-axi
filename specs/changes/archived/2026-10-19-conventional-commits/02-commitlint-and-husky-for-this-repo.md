# 02 - Commitlint and husky for this repo

Owns: package.json, package-lock.json, commitlint.config.js, .husky/**
Docs: none

## Goal

Commits in this repo are linted as conventional commits by a husky commit-msg hook.

## Context

Root package.json already has devDependencies and a `changeset` script (untouched). husky 9 sets core.hooksPath to .husky/_ on `prepare`; hooks are per-checkout, so fresh worktrees need `npm install` (already in the bootstrap). Do not require the Change trailer. Tool tests use temp repos and are unaffected.

## Work

1. Add devDependencies `husky`, `@commitlint/cli`, `@commitlint/config-conventional`; script `"prepare": "husky"`.
2. `commitlint.config.js` extending config-conventional (ESM, repo is type module).
3. `.husky/commit-msg`: `npx --no -- commitlint --edit "$1"`.
4. Run `npm install`; commit updated package-lock.json.

## Done when

`echo "bad message" | npx commitlint` exits non-zero; `echo "chore(plan): ok" | npx commitlint` exits 0. `git commit --allow-empty -m "bad"` is rejected after `npm install`.
