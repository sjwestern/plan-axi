---
title: Glossary
summary: "Terms used across plan-axi: change, step, Owns, wave, backlog, ADR"
---

# Glossary

- **Change**: one planned piece of work, folder `specs/changes/active/<slug>/`.
- **Slug**: kebab-case change id, verb first, max 50 chars.
- **Step**: one `NN-name.md` file plus its task. Smallest unit an agent implements and commits.
- **Owns**: the paths a step edits. Used to check parallel safety.
- **Wave**: steps with no unfinished blockers between them; they may run in parallel if Owns do not overlap.
- **Backlog**: `backlog.md`, one task per change (queued, in flight, done).
- **Docs impact**: proposal section listing every doc a change creates or edits.
- **ADR**: numbered decision record in `docs/decisions/`, status proposed until archive. Cited as an **ADR reference** in the full form `ADR-NNNN-slug` (number and slug must both match a file); bare `ADR 7` is an error.
