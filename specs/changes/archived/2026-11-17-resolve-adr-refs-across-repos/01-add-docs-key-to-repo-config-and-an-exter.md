# 01 - Add docs key to repo config and an external ADR loader

Owns: packages/change-axi/src/planconfig.ts, packages/change-axi/src/configcheck.ts, packages/change-axi/src/adrsources.ts, packages/docs-axi/src/adrrefs.ts, packages/change-axi/test/planconfig.test.ts, packages/change-axi/test/adrsources.test.ts
Docs: none

## Goal

Repos in .plan-axi.toml can declare a docs dir, and a loader returns that repo's ADRs as AdrInfo[].

## Context

RepoConfig lives in planconfig.ts (repoConfigs, readRepoConfigs). adrInfos(docs) in docs-axi adrrefs.ts builds AdrInfo from loaded docs. Source repo path comes from config (main checkout, WSL path; Windows repos resolved as other repo access does). ADR-0014-changes-span-repos-with-one-worktree-per-repo-and-bases-in. Tier none: small contained change.

## Work

1. Add optional docs (string, relative dir) to RepoConfig and its validation (reject absolute paths and ..). 2. Add loadRepoAdrs(repoName, repoRoot, docsDir) returning AdrInfo[] tagged with repo; return a result with unavailable=true when the path or dir is missing instead of throwing. 3. Tests in planconfig.test.ts and adrrefs.test.ts: parse, reject bad values, load, missing dir.

## Done when

npm test passes for change-axi and docs-axi, including new tests; a config with docs = "docs" round-trips through readRepoConfigs.
