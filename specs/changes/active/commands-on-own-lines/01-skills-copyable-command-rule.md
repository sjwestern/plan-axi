# 01 - Skills copyable command rule

Owns: skills/plan-explore/SKILL.md, skills/plan-propose/SKILL.md, skills/plan-apply/SKILL.md, skills/plan-archive/SKILL.md, skills/plan-migrate-docs/SKILL.md
Docs: none

## Goal

Every plan skill tells the agent to put copyable commands on their own lines in code blocks.

## Context

Wording to use verbatim: `Copyable commands: put every command the user may paste in its own fenced code block, one command per line, after the sentence that introduces it. Never end a prose sentence with a command and never split one across lines; for long ones use a short form, a variable, or a script.` Place it near the end of each skill's rules section (or its Report step). Skills are standalone files, no includes.

## Work

1. Add the rule to skills/plan-explore, plan-propose, plan-apply, plan-archive, plan-migrate-docs SKILL.md.
2. In plan-apply and plan-archive, rewrite any inline "run `...`" handoff in the final report or launch text so the command is on its own code-block line.
3. Keep other wording unchanged.

## Done when

`grep -c 'Copyable commands' skills/plan-explore/SKILL.md skills/plan-propose/SKILL.md skills/plan-apply/SKILL.md skills/plan-archive/SKILL.md skills/plan-migrate-docs/SKILL.md` shows 1 for each.
