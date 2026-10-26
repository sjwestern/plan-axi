import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkPiEffort,
  checkPiModel,
  checkProfile,
  parsePiModelRows,
  parsePiThinkingLevels,
  type CheckDeps,
} from "../src/agent.js";
import { readPlanConfig, validatePlanConfig, verifyProfiles } from "../src/planconfig.js";

let dir: string;
let xdg: string;
const cfg = (t: string): void => writeFileSync(join(dir, ".plan-axi.toml"), t);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-pc-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

const TABLE = [
  "provider        model              context  max-out  thinking  images",
  "github-copilot  claude-haiku-4.5   200K     64K      yes       yes",
  "github-copilot  gpt-5              1M       128K     yes       yes",
  "openrouter      gpt-5              1M       128K     yes       yes",
  "openrouter      gpt-5-mini         1M       128K     yes       yes",
].join("\n");
const HELP = "  --thinking <level>             Set thinking level: off, minimal, low, medium, high, xhigh, max\n";

function deps(over: Partial<{ onPath: boolean; list: string; help: string; error: string }> = {}): CheckDeps {
  return {
    onPath: () => over.onPath ?? true,
    run: (_bin, args) => {
      if (over.error) return { status: null, output: "", error: over.error };
      return { status: 0, output: args[0] === "--help" ? (over.help ?? HELP) : (over.list ?? TABLE) };
    },
  };
}

describe("readPlanConfig", () => {
  it("returns profiles, tiers, rules and resolved model", () => {
    cfg(
      '[apply]\nagent = "pi {prompt}"\n[apply.agents.fast]\nharness = "pi"\nmodel = "p/m"\neffort = "low"\n[apply.tiers]\nsmall = "fast"\n[propose]\ndefault_tier = "standard"\n[propose.tiers]\nsmall = ["typos"]\n',
    );
    const c = readPlanConfig(dir);
    expect(c.profiles).toEqual([{ name: "fast", harness: "pi", model: "p/m", effort: "low" }]);
    expect(c.tiers).toEqual({ small: "fast" });
    expect(c.default_tier).toBe("standard");
    expect(c.agent).toBe("pi {prompt}");
    expect(c.rules.small).toEqual(["typos"]);
    expect(c.resolved[0]).toEqual({ tier: "small", profile: "fast", model: "p/m", effort: "low" });
    expect(c.resolved[1]).toEqual({ tier: "standard" });
    expect(c.commit.trailer).toBe("Change");
  });
});

describe("validatePlanConfig", () => {
  it("accepts a valid config", () => {
    expect(() => validatePlanConfig('[apply.agents.a]\nharness = "pi"\n[apply.tiers]\nsmall = "a"\n[propose]\ndefault_tier = "deep"\n')).not.toThrow();
  });
  it("rejects a profile with no harness or command", () => {
    expect(() => validatePlanConfig('[apply.agents.a]\nmodel = "m"\n')).toThrow(/profile "a" needs harness or command/);
  });
  it("rejects an unknown tier", () => {
    expect(() => validatePlanConfig('[apply.agents.a]\nharness = "pi"\n[apply.tiers]\nhuge = "a"\n')).toThrow(/unknown tier "huge"/);
  });
  it("rejects a tier mapped to an undefined profile", () => {
    expect(() => validatePlanConfig('[apply.tiers]\nsmall = "ghost"\n')).toThrow(/undefined profile "ghost"/);
  });
  it("rejects a bad default_tier", () => {
    expect(() => validatePlanConfig('[propose]\ndefault_tier = "x"\n')).toThrow(/default_tier/);
  });
});

describe("pi checks (pure)", () => {
  it("parses thinking levels and falls back", () => {
    expect(parsePiThinkingLevels(HELP)).toEqual(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
    expect(parsePiThinkingLevels("nothing")).toBeUndefined();
    expect(checkPiEffort("low", HELP).status).toBe("ok");
    expect(checkPiEffort("turbo", HELP).status).toBe("invalid");
    expect(checkPiEffort("max", "garbled").status).toBe("ok");
  });
  it("accepts an exact provider/model", () => {
    expect(checkPiModel("github-copilot/gpt-5", parsePiModelRows(TABLE)).status).toBe("ok");
  });
  it("rejects a bare id and lists provider choices (same id under two providers)", () => {
    const r = checkPiModel("gpt-5", parsePiModelRows(TABLE));
    expect(r.status).toBe("invalid");
    expect(r.message).toContain("github-copilot/gpt-5");
    expect(r.message).toContain("openrouter/gpt-5");
    expect(r.message).not.toContain("gpt-5-mini");
  });
  it("rejects a substring-only hit", () => {
    expect(checkPiModel("openrouter/gpt", parsePiModelRows(TABLE)).status).toBe("invalid");
  });
  it("is case sensitive", () => {
    expect(checkPiModel("openrouter/GPT-5", parsePiModelRows(TABLE)).status).toBe("invalid");
  });
  it("treats no-match output as invalid and unparseable output as skipped", () => {
    expect(checkPiModel("a/b", parsePiModelRows('No models matching "b"'))).toMatchObject({ status: "invalid" });
    expect(checkPiModel("a/b", parsePiModelRows("weird output"))).toMatchObject({ status: "skipped" });
  });
  it("handles large output", () => {
    const big = [TABLE, ...Array.from({ length: 5000 }, (_, i) => `agg  model-${i}  1M  1K  yes  no`)].join("\n");
    expect(checkPiModel("agg/model-4999", parsePiModelRows(big)).status).toBe("ok");
  });
});

describe("checkProfile", () => {
  const p = { name: "s", harness: "pi", model: "openrouter/gpt-5", effort: "low" };
  it("ok for a valid profile", () => {
    expect(checkProfile(p, deps()).every((r) => r.status === "ok")).toBe(true);
  });
  it("invalid effort and unknown model", () => {
    const r = checkProfile({ ...p, effort: "turbo", model: "openrouter/nope" }, deps());
    expect(r.map((x) => [x.field, x.status])).toEqual([["effort", "invalid"], ["model", "invalid"]]);
  });
  it("skipped when pi is missing", () => {
    const r = checkProfile(p, deps({ onPath: false }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: "skipped" });
    expect(r[0]!.message).toContain("pi not found on PATH; profile s cannot launch on this machine");
  });
  it("skipped on call failure or timeout", () => {
    const r = checkProfile(p, deps({ error: "spawnSync pi ETIMEDOUT" }));
    expect(r.find((x) => x.field === "model")).toMatchObject({ status: "skipped" });
    expect(r.find((x) => x.field === "model")!.message).toContain("ETIMEDOUT");
  });
  it("skipped on unparseable list output", () => {
    expect(checkProfile({ ...p, effort: undefined } as never, deps({ list: "???" }))[0]).toMatchObject({ status: "skipped" });
  });
  it("command profile checks only the first word", () => {
    const c = { name: "c", command: "mytool --x {prompt}" };
    expect(checkProfile(c, deps())[0]).toMatchObject({ status: "ok", field: "command" });
    expect(checkProfile(c, deps({ onPath: false }))[0]).toMatchObject({ status: "skipped" });
  });
});

describe("verifyProfiles", () => {
  it("checks all or named profiles", () => {
    cfg('[apply.agents.a]\nharness = "pi"\nmodel = "openrouter/gpt-5"\n[apply.agents.b]\ncommand = "x {prompt}"\n');
    expect(verifyProfiles(dir, undefined, deps()).map((v) => v.profile)).toEqual(["a", "b"]);
    expect(verifyProfiles(dir, ["b"], deps())).toHaveLength(1);
    expect(() => verifyProfiles(dir, ["z"], deps())).toThrow(/unknown agent profile/);
  });
});
