# 03 - Changelog from commits with git-cliff

Owns: package.json, package-lock.json, cliff.toml, CHANGELOG.md
Docs: none

## Goal

npm run changelog writes a readable CHANGELOG.md from conventional commits.

## Context

git-cliff is a standalone binary; use the npm wrapper `git-cliff` as a devDependency so no global install is needed. Skip commits scoped `plan` (tool bookkeeping and plan docs). Existing history is non-conventional; unmatched commits are filtered out (`filter_unconventional = true`). Runs after change:conventional-commits step 02 because both edit package.json.

## Work

1. devDependency `git-cliff`; script `"changelog": "git-cliff -o CHANGELOG.md"`.
2. `cliff.toml`: conventional parsing, groups (Features, Bug fixes, Documentation, Refactor, Tests), commit_parsers skipping `scope = "plan"` and `^chore`, header and per-version layout.
3. Generate and commit CHANGELOG.md (it may be nearly empty before new commits; that is fine).

## Done when

`npm run changelog` exits 0 and CHANGELOG.md has grouped entries for conventional commits and none for `chore(plan)`.
