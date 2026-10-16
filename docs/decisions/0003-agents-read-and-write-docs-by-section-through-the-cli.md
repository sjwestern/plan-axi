---
title: Agents read and write docs by section through the CLI
summary: Why docs-axi and change-axi edit single sections instead of whole files
status: accepted
---

# Agents read and write docs by section through the CLI

## Context

A key goal is fewer agent tokens. If an agent can only create whole files, every edit means reading and rewriting the whole document.

## Decision

docs-axi and change-axi expose `sections`, `show --section`, `write --section` and `append`. A section is a heading plus its text. Refs are `Heading`, `Parent/Child` or `Heading#N`. Bodies come from stdin, `--body` or `--body-file`. Writes print a one-line result, never the body. Required plan sections are defined once in `change-axi/src/spec.ts` and printed by `change-axi spec`.

## Consequences

- Cost of an edit is proportional to the section, not the document.
- Skills stay short: they point at `change-axi spec` instead of embedding templates.
- Only ATX (`#`) headings are supported.
