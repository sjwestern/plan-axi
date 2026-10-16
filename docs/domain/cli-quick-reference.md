---
title: CLI quick reference
summary: One-screen reference for docs-axi and change-axi commands with examples
---

# CLI quick reference

Run `<tool> <command> --help` for flags.

## docs-axi

```sh
docs-axi                                   # map
docs-axi search billing invoice
docs-axi sections domain/billing           # headings and refs
docs-axi show domain/billing --section Refunds
printf 'text' | docs-axi write domain/billing --section Refunds
docs-axi append domain/billing --section "Open questions" --body "- Tax?"
docs-axi new domain "Billing" --summary "Invoice rules" --body-file -
docs-axi adr "Use Postgres" --summary "Why jobs live in Postgres" \
  --context "..." --decision "..." --consequences "..."
docs-axi update 7 --status accepted
docs-axi check
```

## change-axi

```sh
change-axi spec proposal                   # required sections and what each holds
change-axi new split-auth "Split the auth module"
change-axi write split-auth proposal --section Why --body "Slow builds."
change-axi step add split-auth "Extract tokens" --owns src/auth/ --after 01-schema
change-axi step set split-auth 02 --owns src/auth/,tests/auth/
change-axi dep split-auth 03 --on 01,02    # cycles are reverted
change-axi check split-auth --waves
change-axi status split-auth
change-axi archive split-auth --dry-run    # then --commit; accepts the change's ADRs
```
