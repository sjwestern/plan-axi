import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const P = "demo-change";
const S = "01-do-it";
const stepText = (): string => readFileSync(join(dir, "specs/changes/active", P, `${S}.md`), "utf8");
const cfg = (t: string): void => writeFileSync(join(dir, ".plan-axi.toml"), t);
const PROFILES = '[apply]\nagent = "dflt {prompt}"\n[apply.agents.small]\nharness = "pi"\nmodel = "p/m"\n[apply.agents.other]\nharness = "pi"\n[apply.tiers]\nsmall = "small"\n';

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-tier-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  delete process.env["CHANGE_AXI_AGENT"];
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
  git("checkout", "-q", "-b", P);
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

describe("Tier header", () => {
  it("round trips set, change and none", async () => {
    expect(stepText()).not.toContain("Tier:");
    await run("step", "set", P, S, "--tier", "small");
    expect(stepText()).toMatch(/^Docs: none\nTier: small\n/m);
    await run("step", "set", P, S, "--tier", "deep");
    expect(stepText()).toContain("Tier: deep");
    expect(stepText().match(/^Tier:/gm)).toHaveLength(1);
    await run("step", "set", P, S, "--tier", "none");
    expect(stepText()).not.toContain("Tier:");
  });
  it("rejects a bad tier and supports step add --tier", async () => {
    const r = await run("step", "set", P, S, "--tier", "huge");
    expect(r.out).toContain("bad tier");
    expect(r.code).not.toBe(0);
    await run("step", "add", P, "Second", "--owns", "lib/", "--tier", "standard");
    expect(readFileSync(join(dir, "specs/changes/active", P, "02-second.md"), "utf8")).toContain("Tier: standard");
  });
});

describe("enter tier resolution", () => {
  it("tier maps to a profile and says why", async () => {
    cfg(PROFILES);
    await run("step", "set", P, S, "--tier", "small");
    const r = await run("enter", P, S, "--print");
    expect(r.out).toContain("small (tier small -> small)");
    expect(r.out).toContain(`pi --model 'p/m' 'apply ${P} ${S}'`);
  });
  it("--agent beats tier; tier beats [apply] agent", async () => {
    cfg(PROFILES);
    await run("step", "set", P, S, "--tier", "small");
    const a = await run("enter", P, S, "--agent", "other", "--print");
    expect(a.out).toContain("other (--agent other)");
    const t = await run("enter", P, S, "--print");
    expect(t.out).not.toContain("dflt");
  });
  it("unmapped tier falls back to config", async () => {
    cfg(PROFILES);
    await run("step", "set", P, S, "--tier", "deep");
    expect((await run("enter", P, S, "--print")).out).toContain("dflt");
  });
});

describe("check warnings", () => {
  it("warns TIER_UNKNOWN", async () => {
    await run("step", "set", P, S, "--tier", "small");
    writeFileSync(join(dir, "specs/changes/active", P, `${S}.md`), stepText().replace("Tier: small", "Tier: huge"));
    expect((await run("check", P)).out).toContain("TIER_UNKNOWN");
  });
  it("warns TIER_UNMAPPED for a missing entry and an undefined profile", async () => {
    cfg('[apply.agents.small]\nharness = "pi"\n[apply.tiers]\nsmall = "ghost"\n');
    await run("step", "set", P, S, "--tier", "small");
    expect((await run("check", P)).out).toContain('undefined profile');
    await run("step", "set", P, S, "--tier", "deep");
    expect((await run("check", P)).out).toContain("TIER_UNMAPPED");
  });
});
