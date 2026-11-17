# 02 - Resolve and qualify ADR refs across source repos

Owns: packages/change-axi/src/check.ts, packages/change-axi/src/adrguard.ts, packages/docs-axi/src/adrrefs.ts, packages/change-axi/test/adrguard.test.ts, packages/change-axi/test/adrsources.test.ts, packages/docs-axi/test/adrrefs.test.ts
Docs: none

## Goal

change-axi check and the ADR guards resolve ADR refs against plan-repo plus source-repo ADRs, with qualified refs and ambiguity errors.

## Context

check.ts builds adrs at lines ~174-185 from the plan repo docs only; adrguard.ts checkAdrs does the same for commit-plan and finish. findRefs and resolveRef in adrrefs.ts parse ADR-NNNN-slug. Number clash guards stay per repo and only look at plan-repo ADRs. Depends on the loader from step 01.

## Work

1. Extend findRefs to accept an optional <repo>: prefix and resolveRef to take AdrInfo with a repo tag. 2. Unqualified ref: resolve by number and slug across all sources; two matches in different repos give ADR_REF_AMBIGUOUS naming the qualified forms. 3. Qualified ref resolves only in that repo; unknown repo gives ADR_REF_UNKNOWN. 4. In check.ts and adrguard.ts add source-repo ADRs; an unavailable source emits warning ADR_SOURCE_UNAVAILABLE (check) and is skipped (guards). 5. Tests: cross-repo resolve, wrong slug, qualified, ambiguous, unavailable source.

## Done when

npm test passes; a fixture plan citing an ADR that exists only in a configured source repo passes change-axi check, and the same plan with a wrong slug fails with ADR_REF_UNKNOWN.
