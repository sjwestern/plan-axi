# 01 - Add medium tier to code and tests

Owns: packages/change-axi/src, packages/change-axi/test
Docs: none

## Goal

Make `medium` a valid tier between small and standard everywhere tiers are handled in code.

## Context

TIERS in spec.ts drives validation in configcheck.ts, commands.ts, configcmd.ts, check.ts, guidance.ts and planconfig.ts. Literals to replace: guidance.ts line 12 initial map, spec.ts Tier guide, commands.ts step set/MODEL_SETUP help, configcmd.ts --tier help. No tier guidance is configured in this repo, so no tier is set on this step.

## Work

1. Change TIERS to [small, medium, standard, deep].
2. Derive tier maps and help/guide strings from TIERS instead of literals (rg for "standard" in src).
3. Extend tests (tier, config, configcheck, guidance, planconfig) with medium cases, plus a test that an old three-tier config is still valid.
4. Check `config` and `guidance` output order.

## Done when

`npm run build && npm test` pass; `node packages/change-axi/dist/bin/change-axi.js config --tier medium=<profile>` accepted and `guidance` lists medium between small and standard.
