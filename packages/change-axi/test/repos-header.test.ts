import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseRepos, splitOwnsRepo } from "../src/change.js";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string;
const P = "demo-change";
const proposal = (): string => join(dir, "specs/changes/active", P, "proposal.md");
const step = (): string => join(dir, "specs/changes/active", P, "01-do-it.md");
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const setHeader = (file: string, line: string): void => {
  const t = readFileSync(file, "utf8");
  writeFileSync(file, t.replace(/^(# .*\n)/, `$1\n${line}\n`));
};
const fillAll = async (): Promise<void> => {
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Steps", "Acceptance", "Docs impact", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", s === "Steps" ? "01-do-it.md - x" : "x");
  }
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01-do-it", "--section", s, "--body", "x");
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-rh-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
  await fillAll();
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

describe("parseRepos / splitOwnsRepo", () => {
  it("parses name@base entries", () => {
    expect(parseRepos("# t\n\nRepos: web@release/2.1, api\n\n## Why\n")).toEqual([{ name: "web", base: "release/2.1" }, { name: "api" }]);
    expect(parseRepos("# t\n")).toEqual([]);
    expect(parseRepos("Repos: none\n")).toEqual([]);
  });
  it("splits repo prefixes and ignores drive letters", () => {
    expect(splitOwnsRepo("api:src/x.ts")).toEqual({ repo: "api", path: "src/x.ts" });
    expect(splitOwnsRepo("src/x.ts")).toEqual({ path: "src/x.ts" });
    expect(splitOwnsRepo("C:/x")).toEqual({ path: "C:/x" });
  });
});

describe("check Repos header", () => {
  it("passes with no Repos header and plain Owns (existing plans)", async () => {
    const r = await run("check", P);
    expect(r.out).not.toMatch(/REPO|OWNS_REPO/);
  });
  it("errors when an Owns prefix is not listed", async () => {
    await run("step", "set", P, "01-do-it", "--owns", "api:src/");
    const r = await run("check", P);
    expect(r.out).toMatch(/OWNS_REPO_UNLISTED.*api:/);
    expect(r.code).not.toBe(0);
  });
  it("errors when a listed repo is not in config", async () => {
    setHeader(proposal(), "Repos: api@main");
    const r = await run("check", P);
    expect(r.out).toMatch(/REPO_UNKNOWN.*api/);
  });
  it("passes when listed, configured and prefixed", async () => {
    writeFileSync(join(dir, ".plan-axi.toml"), '[repos.api]\npath = "~/api"\n');
    setHeader(proposal(), "Repos: api@main");
    await run("step", "set", P, "01-do-it", "--owns", "api:src/, docs/");
    const r = await run("check", P);
    expect(r.out).not.toMatch(/REPO_UNKNOWN|OWNS_REPO_UNLISTED/);
    expect(readFileSync(step(), "utf8")).toMatch(/Owns: api:src\//);
  });
});

describe("spec proposal", () => {
  it("documents the Repos header", async () => {
    const r = await run("spec", "proposal");
    expect(r.out).toMatch(/Repos/);
  });
});
