# 03 - Accept repo:path in show and sections

Owns: packages/docs-axi/src/cli.ts, packages/docs-axi/test/multirepo.test.ts
Docs: none

## Goal

docs-axi show and sections accept `repo:path`, so an agent can pass a qualified link target as is.

## Context

show and sections take a doc path or ADR number and read the plan repo, or another repo with --repo <name>. Search takes terms, not paths, so it keeps --repo and --all-repos. resolveCtx in cli.ts picks the repo from --repo only. ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos.

## Work

1. In cli.ts, for show and sections, treat a first positional `<name>:<path>` whose name is a source repo as --repo <name> with that path. An unknown name falls through as a plain path. Reuse the sourceRepos lookup and its NOT_FOUND error.
2. A qualified path together with a conflicting --repo gives VALIDATION_ERROR. The same repo in both is fine.
3. Update show and sections help text.
4. Tests in multirepo.test.ts: show and sections by qualified path, with --section, unknown repo, conflicting --repo.

## Done when

npm test in packages/docs-axi passes; `docs-axi show api:architecture/x.md --section Y` prints the same as `--repo api`.
