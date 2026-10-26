import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProfileCommand, loadProfiles, resolveAgent } from "../src/agent.js";

let dir: string;
let xdg: string;
const vars = { prompt: "apply a b", slug: "a", step: "b", path: "/p" };
const cfg = (t: string): void => writeFileSync(join(dir, ".plan-axi.toml"), t);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-prof-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  delete process.env["CHANGE_AXI_AGENT"];
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  delete process.env["CHANGE_AXI_AGENT"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

describe("profiles", () => {
  it("flattens dotted tables into profiles", () => {
    cfg('[apply.agents.small]\nharness = "pi"\nmodel = "p/m"\neffort = "low"\n[apply.agents.big]\ncommand = "x {prompt}"\n');
    expect(loadProfiles(dir)).toEqual([
      { name: "small", harness: "pi", model: "p/m", effort: "low" },
      { name: "big", command: "x {prompt}" },
    ]);
  });
  it("requires harness or command", () => {
    cfg('[apply.agents.bad]\nmodel = "m"\n');
    expect(() => loadProfiles(dir)).toThrow(/needs harness or command/);
  });
  it("builds the pi command", () => {
    expect(buildProfileCommand({ name: "s", harness: "pi", model: "p/m", effort: "low" }, vars, "linux")).toBe("pi --model 'p/m' --thinking 'low' 'apply a b'");
    expect(buildProfileCommand({ name: "s", harness: "pi" }, vars, "linux")).toBe("pi 'apply a b'");
  });
  it("uses command over harness; unknown harness errors", () => {
    expect(buildProfileCommand({ name: "s", harness: "pi", command: "x {slug}" }, vars, "linux")).toBe("x 'a'");
    expect(() => buildProfileCommand({ name: "s", harness: "nope" }, vars, "linux")).toThrow(/unsupported harness "nope"/);
  });
  it("resolution order: --agent, tier, config, env", () => {
    cfg('[apply]\nagent = "cfg {prompt}"\n[apply.agents.a]\nharness = "pi"\n[apply.agents.t]\nharness = "pi"\n');
    process.env["CHANGE_AXI_AGENT"] = "env {prompt}";
    expect(resolveAgent(dir, { profile: "a", tierProfile: "t" })?.source).toBe("--agent a");
    expect(resolveAgent(dir, { tierProfile: "t", tier: "small" })?.source).toBe("tier small");
    expect(resolveAgent(dir)?.source).toBe("repo/user config");
    expect(() => resolveAgent(dir, { profile: "zzz" })).toThrow(/unknown agent profile "zzz"/);
  });
});
