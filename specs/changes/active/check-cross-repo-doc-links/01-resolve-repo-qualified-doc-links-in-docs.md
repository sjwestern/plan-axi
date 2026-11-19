# 01 - Resolve repo-qualified doc links in docs-axi check

Owns: packages/docs-axi/src/commands/check.ts, packages/docs-axi/src/repohost.ts, packages/docs-axi/test/multirepo.test.ts
Docs: none

## Goal

docs-axi check verifies `[text](repo:path.md)` links against the source repo docs.

## Context

checkLinks skips every scheme target. sourceRepos and loadDocs in repohost.ts give source repo roots and docs. Tier: none configured. ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos.

## Work

1. Export a helper in repohost.ts that loads source repo doc paths once per run (name -> Set of doc paths, plus unavailable names).
2. In checkLinks, match target against ^<name>: for a source repo name. Strip #anchor and ?query, decode. Missing path gives BROKEN_LINK (detail names repo and path). Unavailable repo adds warning DOC_SOURCE_UNAVAILABLE once per repo.
3. Leave other schemes and unknown names skipped.
4. Tests in multirepo.test.ts: resolved, missing, anchor ignored, unknown prefix, https, unavailable source, doc outside layout (warning).

## Done when

npm test in packages/docs-axi passes with the new cases; docs-axi check on a fixture with a broken qualified link exits non-zero with BROKEN_LINK.
