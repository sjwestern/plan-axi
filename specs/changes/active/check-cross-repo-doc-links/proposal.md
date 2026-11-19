# Check repo-qualified doc links across repos

## Why

docs-axi check resolves ADR refs across repos but skips any link with a scheme, so a link into another repo is never verified. Plan repos that hold no docs of their own cite code-repo docs often. Agents cannot link them in a checked way, so they rewrite the paths as prose, and those paths go stale unnoticed.

## Context

Read: docs/decisions/0015-adr-refs-resolve-across-configured-repos.md, docs/decisions/0016-docs-axi-reads-and-checks-docs-across-configured-repos.md (amended with this design), docs/domain/cli-quick-reference.md, packages/docs-axi/src/commands/check.ts (checkLinks) and src/repohost.ts (sourceRepos). ADR-0015-adr-refs-resolve-across-configured-repos and ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos apply.

## What changes

- A markdown link `[text](repo:path.md#anchor)` where repo is a source repo (has docs in [repos.<name>]) is checked: the path is relative to that repo docs dir, as printed by `docs-axi list --repo <repo>`.
- Missing doc gives BROKEN_LINK. Unreadable source repo gives warning DOC_SOURCE_UNAVAILABLE and the link is skipped.
- Other schemes (https:, mailto:) and names that are not source repos stay ignored.
- Unmanaged-layout docs report these as warnings, like other dead links.
- `docs-axi show` and `sections` accept the same `repo:path`, so a link target can be pasted into show unchanged. Search takes terms and keeps --repo and --all-repos.
- Rows from list, search, adr list and adr search read from another repo (--repo, --all-repos) print `repo:path`. The local repo rows stay plain.

## Out of scope

- Anchor or section existence checks.
- Scanning plan prose: change-axi check does not verify doc paths in proposal or step bodies, for any repo. Docs link with qualified links; plan bodies stay as they are.
- Relative filesystem links across checkouts.
- Qualified paths in prose or code spans.
- Writing to other repos, renumber, fix-refs.

## Approach

In checkLinks, before the scheme skip, match `<name>:<path>` against sourceRepos names. Load the source repo docs once per check run (reuse loadDocs as loadSourceAdrs does) and test the path against its doc list, so Windows path handling stays in repohost. Alternatives: relative filesystem links (breaks with layout, worktrees and Windows repos); a new URL-like scheme such as docs:repo/path (more syntax, no gain). The design is recorded in ADR-0016-docs-axi-reads-and-checks-docs-across-configured-repos.

## Steps

- `01-resolve-repo-qualified-doc-links-in-docs.md` - resolve and test qualified links in docs-axi check
- `02-document-repo-qualified-doc-links.md` - quick reference, workflow doc, changelog
- `03-accept-repo-path-in-show-and-sections.md` - show and sections accept repo:path
- `04-print-repo-path-in-cross-repo-list-and-s.md` - repo:path rows in cross-repo list and search

## Acceptance

- npm test passes in packages/docs-axi, including new multirepo tests: resolved link, missing doc, anchor ignored, unknown prefix ignored, https ignored, unavailable source warns.
- docs-axi check passes on a plan repo with a valid qualified link and fails with BROKEN_LINK after the target is renamed.

## Docs impact

- docs/decisions/0016-docs-axi-reads-and-checks-docs-across-configured-repos.md - update: repo-qualified doc links (already amended).
- docs/domain/cli-quick-reference.md - update: link syntax and codes.
- docs/architecture/plan-workflow.md - update: cross-repo links in docs.
- CHANGELOG.md - update: entry.

## Risks and open questions

- Checks need source checkouts present; unavailable sources only warn.
- Qualified row paths change the output of --repo and --all-repos reads; any script parsing those paths must strip the prefix.
