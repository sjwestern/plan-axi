import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
const P = "demo-change";
const hasTreehouse = spawnSync("treehouse", ["--version"]).status === 0;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-start-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Docs impact", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", "x");
  }
  await run("write", P, "proposal", "--section", "Steps", "--body", "- `01-do-it.md` - it");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01", "--section", s, "--body", "x");
  writeFileSync(join(dir, ".gitignore"), "");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("start", () => {
  it("refuses an uncommitted plan", async () => {
    const r = await run("start", P, "--no-worktree");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Commit the plan");
  });

  it("starts, commits only backlog.md, reports ready steps, is idempotent", async () => {
    git("add", "-A");
    git("commit", "-q", "-m", "plan");
    const dry = await run("start", P, "--dry-run");
    expect(dry.out).toContain("dry run");
    expect(execFileSync("tasks-axi", ["show", P, "--file", "backlog.md"], { cwd: dir, encoding: "utf8" })).toContain("state: queued");

    writeFileSync(join(dir, "unrelated.txt"), "x");
    git("add", "unrelated.txt");
    const r = await run("start", P, "--no-worktree");
    expect(r.code).toBe(0);
    expect(r.out).toContain("started");
    expect(r.out).toContain("01-do-it");
    expect(git("log", "-1", "--format=%s")).toBe(`start ${P}`);
    expect(git("show", "--name-only", "--format=", "HEAD")).toBe("backlog.md");
    expect(git("status", "--porcelain")).toContain("unrelated.txt");
    expect((await run("start", P, "--no-worktree")).out).toContain("already in flight");
  });

  it("refuses on a non-default branch", async () => {
    git("add", "-A");
    git("commit", "-q", "-m", "plan");
    git("checkout", "-q", "-b", "other");
    const r = await run("start", P, "--no-worktree");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("start runs on main");
  });

  it.skipIf(!hasTreehouse)("leases a treehouse worktree and reuses it", async () => {
    const pool = mkdtempSync(join(tmpdir(), "change-axi-pool-"));
    process.env["TREEHOUSE_ROOT"] = pool;
    git("add", "-A");
    git("commit", "-q", "-m", "plan");
    try {
      const r = await run("start", P);
      expect(r.out).toContain("worktree:");
      expect(r.out).toContain("worktree_id");
      const again = await run("start", P);
      expect(again.out).toContain("already in flight");
      const path = /worktree: (\S+)/.exec(r.out)?.[1] as string;
      expect(existsSync(path)).toBe(true);
      expect(again.out).toContain(path);
      execFileSync("treehouse", ["return", path], { cwd: dir, stdio: "ignore" });
    } finally {
      delete process.env["TREEHOUSE_ROOT"];
      rmSync(pool, { recursive: true, force: true });
    }
  });
});
