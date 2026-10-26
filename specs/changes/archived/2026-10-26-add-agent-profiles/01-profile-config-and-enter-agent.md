# 01 - Profile config and enter --agent

Owns: packages/change-axi/src/agent.ts, packages/change-axi/src/commands.ts, packages/change-axi/test/profiles.test.ts, packages/change-axi/test/enter.test.ts
Docs: docs/decisions/0006-agent-launch-uses-a-command-template.md

## Goal

`enter` can run a configured profile (harness, model, effort) chosen with `--agent <name>`, with the existing resolution order intact below it.

## Context

ADR-0006-agent-launch-uses-a-command-template: the command template stays; profiles add to it. `agent.ts` has `resolveAgent(root)` (config `apply.agent`, env, autodetect) and `buildCommand(template, vars)`. `loadRawConfig` returns a flat `table.key` map; confirm `[apply.agents.small]` flattens to `apply.agents.small.model`. Pi flags (verified with `pi --help`): `--model <provider/id>`, `--thinking <off|minimal|low|medium|high|xhigh|max>`. Step 2 and the later `run` command reuse `buildProfileCommand` and `resolveAgent`; keep their signatures stable.

## Work

1. `agent.ts`: `interface AgentProfile { name; harness; model?; effort?; command? }` and `loadProfiles(root)` reading `apply.agents.<name>.{harness,model,effort,command}`; harness required unless `command` is set.
2. `buildProfileCommand(profile, vars)`: if `command`, use `buildCommand`. Else a harness adapter table; pi: `pi [--model M] [--thinking E] {prompt}` shell-quoted. Unknown harness without `command`: `AxiError` naming supported harnesses.
3. `resolveAgent(root, opts?: { profile?: string; tierProfile?: string })`: `opts.profile` (error listing defined names if unknown), then `opts.tierProfile` (used by step 2), then existing config, env, autodetect. `AgentChoice.source` gains `--agent <name>` and `tier <t>` forms.
4. `commands.ts` enter: parse `--agent`, pass through, print `agent: <name> (--agent)` style provenance and the built command. No-profile output is byte-identical to today.
5. Tests `profiles.test.ts` plus additions in `enter.test.ts`: dotted-table flattening, pi command shape, unknown profile error, override order, unchanged default output.

## Done when

`npm test` passes. In a temp repo with `[apply.agents.small] harness="pi" model="p/m" effort="low"`, `change-axi enter <slug> <step> --agent small --print` prints `pi --model 'p/m' --thinking 'low' '<prompt>'` (quoted per `shellQuote`) and names the profile; with no profiles, output matches the pre-change golden test.
