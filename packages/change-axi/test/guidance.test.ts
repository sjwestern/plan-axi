import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { loadGuidance } from "../src/guidance.js";

let dir: string;
let xdg: string;
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const repoCfg = (t: string): void => writeFileSync(join(dir, ".plan-axi.toml"), t);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-guid-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  mkdirSync(join(dir, ".git"));
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

describe("guidance", () => {
  it("parses rules and default tier", () => {
    repoCfg('[propose]\ndefault_tier = "small"\n[propose.tiers]\nstandard = ["db migrations"]\n');
    expect(loadGuidance(dir)).toEqual({ default_tier: "small", tiers: { small: [], standard: ["db migrations"], deep: [] } });
  });
  it("unions user and repo rules", () => {
    mkdirSync(join(xdg, "plan-axi"), { recursive: true });
    writeFileSync(join(xdg, "plan-axi", "config.toml"), '[propose.tiers]\ndeep = ["user rule"]\n');
    repoCfg('[propose.tiers]\ndeep = ["repo rule"]\n');
    expect(loadGuidance(dir).tiers.deep).toEqual(["user rule", "repo rule"]);
  });
  it("lists rules and profile per tier", async () => {
    repoCfg('[propose.tiers]\nstandard = ["db migrations"]\n[apply.agents.mid]\nharness = "pi"\n[apply.tiers]\nstandard = "mid"\n');
    const r = await run("guidance");
    expect(r.out).toContain("db migrations");
    expect(r.out).toContain("mid");
    expect(r.code).toBe(0);
  });
  it("prints a hint with no config", async () => {
    const r = await run("guidance");
    expect(r.out).toContain("none configured");
    expect(r.out).toContain("[propose.tiers]");
    expect(r.code).toBe(0);
  });
});
