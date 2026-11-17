# Resolve ADR refs against ADRs in configured repos

## Why

A plan repo can coordinate changes in several code repos, but ADR refs resolve only against the plan repo's own docs. Refs to ADRs that live in a code repo fail change-axi check with ADR_REF_UNKNOWN. This blocks moving existing plans from a code repo into a dedicated plan repo that has no docs of its own: plans that cite the code repo's ADRs would fail check until those ADRs are also moved.

## Context

Read: docs/decisions ADR-0012-adr-references-carry-number-and-slug-and-clashes-are-guarded (ref form and guards), ADR-0014-changes-span-repos-with-one-worktree-per-repo-and-bases-in (repo config and platform flag), ADR-0009-docs-layout-is-config-adr-section-stays-a-fixed-type, packages/change-axi/src/check.ts, adrguard.ts, planconfig.ts, packages/docs-axi/src/adrrefs.ts.

## What changes

- A repo in .plan-axi.toml may set docs = "<dir>" (its docs dir, relative to the repo) to declare it an ADR source.
- change-axi check and the commit-plan and finish guards resolve ADR-NNNN-slug refs against the plan repo ADRs plus the ADRs of every source repo, read from that repo's configured main checkout.
- A ref may be qualified as <repo>:ADR-NNNN-slug. An unqualified ref that matches ADRs in more than one repo (same number and slug) is an error asking for the qualified form.
- Windows repos are read through their WSL path (wslpath) like other repo access.
- If a source repo path is missing, check warns ADR_SOURCE_UNAVAILABLE and skips it; refs that only it could resolve then report ADR_REF_UNKNOWN as today.

## Out of scope

- Cross-repo number clash guards. Each repo still numbers and guards its own ADRs, and docs-axi adr add, renumber and fix-refs stay single-repo.
- docs-axi check resolving source repo ADRs: docs bodies cannot cite them yet.
- Writing to ADRs in other repos.
- Moving or merging ADRs between repos. A later docs migration into the plan repo removes the need for source repos.

## Approach

Add an optional docs key to RepoConfig (planconfig.ts) and a loader in docs-axi lib that builds AdrInfo[] from a given root and docs dir. change-axi check and adrguard combine plan-repo ADRs with source-repo ADRs tagged by repo name. findRefs and resolveRef in adrrefs.ts accept an optional repo qualifier and report ambiguity. Reads use the repo main checkout path from config, not a worktree; no git calls, so no fetch. Alternative considered: copy ADRs into the plan repo - rejected, it duplicates and drifts. Alternative: skip ADR validation for unknown refs - rejected, it hides real typos. Record the decision as an ADR.

## Steps

- `01-add-docs-key-to-repo-config-and-an-exter.md` - repo docs key and external ADR loader
- `02-resolve-and-qualify-adr-refs-across-sour.md` - resolve and qualify refs in check and guards
- `03-document-cross-repo-adr-refs-and-record.md` - ADR and docs

## Acceptance

- In a plan repo with a source repo configured, change-axi check passes for a plan citing ADR-NNNN-slug that only exists in the source repo, and fails with ADR_REF_UNKNOWN on a wrong slug.
- A qualified ref <repo>:ADR-NNNN-slug resolves; an ambiguous unqualified ref errors with the qualified form in the message.
- A missing source path warns and does not crash check, commit-plan or finish.
- Unit tests cover config parsing, loading, qualified and ambiguous refs. npm test passes.

## Docs impact

- `docs/decisions/0015-adr-refs-resolve-across-configured-repos.md` - new ADR: refs resolve across configured repos.
- `docs/domain/cli-quick-reference.md` - update: docs key on repos and the qualified ref form.
- `docs/architecture/plan-workflow.md` - update: where multi-repo ADR refs resolve.
- `docs/README.md` - update: index entry for the new ADR.

## Risks and open questions

- Qualified-ref syntax <repo>:ADR-NNNN-slug is a proposal; confirm it does not collide with existing findRefs patterns.
- Same number and slug in two repos is rare but possible; the ambiguity error covers it.
- Decide whether docs-axi check should also validate refs in plan-repo docs against source repos (default: yes, same resolver).
