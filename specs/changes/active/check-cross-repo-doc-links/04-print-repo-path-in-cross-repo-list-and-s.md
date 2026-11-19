# 04 - Print repo:path in cross-repo list and search results

Owns: packages/docs-axi/src/model.ts, packages/docs-axi/src/commands/read.ts, packages/docs-axi/src/cli.ts, packages/docs-axi/test/multirepo.test.ts
Docs: none

## Goal

Results read from another repo print `repo:path`, so a result pastes into a link or `show` unchanged.

## Context

row() in commands/read.ts prints d.path. cli.ts builds the Ctx for --repo and for each repo under --all-repos. The plan repo own rows stay plain. adr list and adr search use the same row formatter. ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos.

## Work

1. Add optional repoName to Ctx (model.ts).
2. In cli.ts set repoName for --repo and for source repos under --all-repos, not for the local repo.
3. In row() prefix path with `<repoName>:` when set. Check the hint line in show output and truncation hints use the same form.
4. Tests in multirepo.test.ts: --repo list, --all-repos search (local plain, source qualified), adr list --repo, and a result path piped into show.

## Done when

npm test in packages/docs-axi passes; `docs-axi list --repo <r>` prints `<r>:<path>` rows and `docs-axi show` accepts a printed path.
