import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const write = (rel: string): void => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), "x");
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-done-"));
  process.env["TASKS_AXI_FILE"] = "";
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", "demo", "Demo");
  await run("step", "add", "demo", "First", "--owns", "src/a/");
  git("add", "-A");
  git("commit", "-q", "-m", "plan");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("done", () => {
  it("errors on an unstarted step", async () => {
    const r = await run("done", "demo", "01");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("not started");
  });

  it("commits only tasks.md and stays quiet inside Owns", async () => {
    await run("claim", "demo", "01");
    write("src/a/x.ts");
    git("add", "src/a/x.ts");
    git("commit", "-q", "-m", "work");
    write("other-dirty.txt");
    const r = await run("done", "demo", "01");
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("OUTSIDE_OWNS");
    expect(git("show", "--name-only", "--format=%s", "HEAD")).toBe("chore(plan): done demo 01-first\n\nspecs/changes/active/demo/tasks.md");
    expect(git("status", "--porcelain")).toContain("other-dirty.txt");
    expect((await run("done", "demo", "01")).out).toContain("already done");
  });

  it("warns on paths outside Owns", async () => {
    await run("claim", "demo", "01");
    write("src/b/y.ts");
    git("add", "src/b/y.ts");
    git("commit", "-q", "-m", "stray");
    const r = await run("done", "demo", "01");
    expect(r.out).toContain("OUTSIDE_OWNS");
    expect(r.out).toContain("src/b/y.ts");
  });
});
