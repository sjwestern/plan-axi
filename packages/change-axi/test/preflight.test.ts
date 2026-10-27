import { describe, expect, it } from "vitest";
import type { AgentChoice, CheckDeps } from "../src/agent.js";
import { preflightProfile } from "../src/preflight.js";

const deps = (help: string, models: string): CheckDeps => ({
  onPath: () => true,
  run: (_b, args) => ({ status: 0, output: args[0] === "--help" ? help : models }),
});
const HELP = "  --thinking <level>   Set thinking level: off, minimal, low, medium, high";
const MODELS = "provider  model  context\nprov      good   1M\n";
const choice = (effort: string, model: string): AgentChoice => ({ template: "pi", source: "t", profile: { name: "p", harness: "pi", effort, model } });

describe("preflightProfile", () => {
  it("returns nothing for non-profile choices", () => {
    expect(preflightProfile({ template: "x {prompt}", source: "t" }, deps(HELP, MODELS))).toEqual([]);
  });
  it("ok for valid profile", () => {
    const r = preflightProfile(choice("low", "prov/good"), deps(HELP, MODELS));
    expect(r.map((x) => x.status)).toEqual(["ok", "ok"]);
  });
  it("flags invalid effort and model", () => {
    const r = preflightProfile(choice("ultra", "prov/nope"), deps(HELP, MODELS));
    expect(r.map((x) => [x.field, x.status])).toEqual([["effort", "invalid"], ["model", "invalid"]]);
  });
  it("skips when harness missing", () => {
    const r = preflightProfile(choice("low", "prov/good"), { onPath: () => false, run: () => ({ status: 1, output: "" }) });
    expect(r.map((x) => x.status)).toEqual(["skipped"]);
  });
});
