import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string;
let bin: string;
const saved: Record<string, string | undefined> = {};
const KEYS = ["PATH", "XDG_CONFIG_HOME", "CHANGE_AXI_AGENT", "HERDR_ENV", "HERDR_TAB_ID", "HERDR_BIN_PATH"];
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
const log = (): string => (existsSync(join(bin, "herdr.log")) ? readFileSync(join(bin, "herdr.log"), "utf8") : "");

function fakeHerdr(exit = 0): void {
  const f = join(bin, "herdr");
  writeFileSync(f, `#!/bin/sh\necho "$@" >> "${join(bin, "herdr.log")}"\nexit ${exit}\n`);
  chmodSync(f, 0o755);
}

beforeEach(async () => {
  for (const k of KEYS) saved[k] = process.env[k];
  dir = mkdtempSync(join(tmpdir(), "change-axi-herdr-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-bin-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  process.env["PATH"] = `${bin}${delimiter}${process.env["PATH"]}`;
  delete process.env["CHANGE_AXI_AGENT"];
  delete process.env["HERDR_ENV"];
  delete process.env["HERDR_TAB_ID"];
  delete process.env["HERDR_BIN_PATH"];
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
  git("checkout", "-q", "-b", P);
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  for (const d of [dir, xdg, bin]) rmSync(d, { recursive: true, force: true });
});

describe("enter herdr tab", () => {
  it("renames the tab to the slug in herdr", async () => {
    fakeHerdr();
    process.env["HERDR_ENV"] = "1";
    process.env["HERDR_TAB_ID"] = "t-7";
    await run("enter", P, "--print");
    expect(log().trim()).toBe(`tab rename t-7 ${P}`);
  });

  it("does nothing without HERDR_ENV", async () => {
    fakeHerdr();
    process.env["HERDR_TAB_ID"] = "t-7";
    await run("enter", P, "--print");
    expect(log()).toBe("");
  });

  it("does nothing for --list", async () => {
    fakeHerdr();
    process.env["HERDR_ENV"] = "1";
    process.env["HERDR_TAB_ID"] = "t-7";
    await run("enter", "--list");
    expect(log()).toBe("");
  });

  it("ignores a failing herdr binary", async () => {
    process.env["HERDR_ENV"] = "1";
    process.env["HERDR_TAB_ID"] = "t-7";
    const base = await run("enter", P, "--print");
    fakeHerdr(1);
    const r = await run("enter", P, "--print");
    expect(log().trim()).toBe(`tab rename t-7 ${P}`);
    expect(r.code).toBe(base.code);
    expect(r.out).toBe(base.out);
  });
});

describe("closeHerdrTabOnExit", () => {
  it("registers an exit hook only inside herdr", async () => {
    const { closeHerdrTabOnExit, inHerdrTab } = await import("../src/herdr-tab.js");
    const before = process.listenerCount("exit");
    closeHerdrTabOnExit({});
    expect(process.listenerCount("exit")).toBe(before);
    expect(inHerdrTab({ HERDR_ENV: "1", HERDR_TAB_ID: "t" })).toBe(true);
    expect(inHerdrTab({ HERDR_TAB_ID: "t" })).toBe(false);
  });
});
