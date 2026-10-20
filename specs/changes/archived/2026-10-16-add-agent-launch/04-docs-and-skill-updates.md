# 04 - Docs and skill updates

Owns: docs/domain/cli-quick-reference.md, docs/architecture/plan-workflow.md, docs/decisions/0006-agent-launch-uses-a-command-template.md, README.md, skills/plan-apply/SKILL.md
Docs: none

## Goal

Docs and the apply skill describe `enter`, `setup`, branch-aware home and `[apply] agent`; ADR-0006-agent-launch-uses-a-command-template accepted content matches the build.

## Context

ADR-0006-agent-launch-uses-a-command-template was created at propose time with status proposed and is accepted at archive. Docs sections to touch are listed in the proposal Docs impact. The skill should tell agents on a change branch to run bare `change-axi` for orientation and to prefer `change-axi enter` for launch.

## Work

1. `docs/domain/cli-quick-reference.md`: `enter`, `setup`, branch-aware home, config example.
2. `docs/architecture/plan-workflow.md`: launch/enter flow and agent orientation.
3. `docs/decisions/0006-...md`: adjust text if the build differs; keep status proposed.
4. `README.md` quick start: `change-axi enter`.
5. `skills/plan-apply/SKILL.md`: Launch uses `change-axi enter` (or `start`), Execute begins with bare `change-axi`.
6. `docs-axi check`.

## Done when

`docs-axi check` passes; the skill and docs mention only commands that exist (`change-axi enter --help` and `setup --help` work).
