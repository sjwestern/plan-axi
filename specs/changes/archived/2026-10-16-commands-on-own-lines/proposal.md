# Skills and setup block: commands on their own lines

## Why

Agents often end a prose sentence with a command (`... then run change-axi finish my-change`). The terminal wraps prose at spaces, even inside backticks, so a copied command arrives split across lines and fails. Users fixed this in their global agent instructions, which does not help other users of plan-axi. The fix belongs in the skills and the repo block that plan-axi installs.

## Context

Docs read: `docs/architecture/plan-workflow.md`, `docs/domain/cli-quick-reference.md`. ADR-0003-agents-read-and-write-docs-by-section-through-the-cli (agents act through the CLI). Skills that tell agents what to report or tell users what to run: plan-explore, plan-propose, plan-apply, plan-archive, plan-migrate-docs. `change-axi setup` writes a managed block into AGENTS.md (`src/setup.ts`).

## What changes

- Each plan skill gets a short rule: every command the user may copy goes in a fenced code block, on its own line, one command per block line, never at the end of a prose sentence and never split across lines (use short forms, variables, or a script for long ones).
- The `change-axi setup` managed block carries the same rule, so any repo that ran setup gets it for all agents.
- `setup` refreshes an existing managed block when its text is outdated (replace between the markers), so repos set up earlier pick the rule up.

## Out of scope

Changing CLI `help:` lines (read by agents, not copied by users); editing any global agent file; markdown renderer or terminal changes; checking agent output automatically.

## Approach

A single sentence rule, duplicated verbatim in the five skills (skills are standalone prompt files; no shared include). The setup block gets one bullet. `applySetup` currently returns unchanged when the markers exist: change it to compare the block text and replace it when different, reporting `changed`. Alternatives: only a global AGENTS.md line (rejected: per user, not per tool); CLI output as bare commands (rejected: agents rewrite prose anyway).

## Steps

- `01-skills-copyable-command-rule.md` - the rule in all five skills
- `02-setup-block-carries-the-rule.md` - rule in the setup block, existing block refreshed in place

## Acceptance

- `grep -c 'own line' skills/plan-*/SKILL.md` is at least 1 for each skill.
- `npm test -w packages/change-axi` passes; setup tests cover a stale block being replaced, an identical block staying unchanged, and `--remove` still working.
- `change-axi setup` on a repo with the old block updates it and reports changed.
- `change-axi check commands-on-own-lines` and `docs-axi check` pass.

## Docs impact

None - prompt text and a managed block; no doc describes either.

## Risks and open questions

- Agents may still ignore the rule; it is a prompt, not enforcement.
- Refreshing the block rewrites user-visible text between the markers only; text outside is untouched.
- Skills are symlinked from `skills/`, so edits apply on merge with no install step.
