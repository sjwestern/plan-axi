# 02 - Document repo-qualified doc links

Owns: docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, CHANGELOG.md
Docs: none

## Goal

Docs describe repo-qualified doc links.

## Context

ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos is already amended. Cross-repo section in docs/domain/cli-quick-reference.md covers ADR refs only.

## Work

1. cli-quick-reference.md: add the `[text](repo:path.md)` syntax, path relative to the repo docs dir, BROKEN_LINK and DOC_SOURCE_UNAVAILABLE.
2. plan-workflow.md: note that docs cite other repos with qualified links, not prose paths.
3. CHANGELOG.md: docs-axi entry.
4. cli-quick-reference.md: show and sections accept `repo:path`; list, search and adr list or search print `repo:path` for other repos.

## Done when

docs-axi check passes; the three docs describe the same syntax and codes as step 01 implements.
