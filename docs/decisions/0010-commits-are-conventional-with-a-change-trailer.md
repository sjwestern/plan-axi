---
title: Commits are conventional with a Change trailer
summary: Tool and agent commits use conventional commit format; the change slug moves to a Change trailer
status: proposed
---

# Commits are conventional with a Change trailer

## Context

Tool commits were free-form (start foo, foo: done 01-x). That blocks changelog generation and commit hooks, and the owner wants to reuse the tool in repos that lint commits.

## Decision

Tool commits are `<type>(<scope>): <what>` with a `<Trailer>: <slug>` trailer. Type, plan type (used by `change-axi commit-plan`), scope and trailer key come from `[commit]` in .plan-axi.toml, defaulting to `chore`, `docs`, `plan` and `Change`; an empty scope or trailer drops it. Agent commits use conventional types scoped to the area changed, plus the same trailer. This repo lints with commitlint via husky and generates CHANGELOG.md with git-cliff on demand.

## Consequences

Hook failures fail the tool command, so start/done restore their file and archive leaves changes staged. Repos with different commitlint rules set `[commit]` instead of editing the tool. Subject wording stays fixed. Bookkeeping commits can be excluded from the changelog by scope.
