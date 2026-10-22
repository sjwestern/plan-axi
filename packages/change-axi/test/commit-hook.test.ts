import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
const P = "demo";
const hook = (): string => join(dir, ".git/hooks/commit-msg");
const reject = (): void => {
  writeFileSync(hook(), "#!/bin/sh\necho 'subject may not be empty' >&2\necho 'type may not be empty' >&2\nexit 1\n");
  chmodSync(hook(), 0o755);
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-hook-"));
  process.env["TASKS_AXI_FILE"] = "";
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo");
  await run("step", "add", P, "First", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Docs impact", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", "x");
  }
  await run("write", P, "proposal", "--section", "Steps", "--body", "- `01-first.md` - it");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01", "--section", s, "--body", "x");
  writeFileSync(join(dir, ".gitignore"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "plan");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("rejected commits", () => {
  it("start fails cleanly and a rerun succeeds", async () => {
    reject();
    const r = await run("start", P, "--no-worktree");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("commit rejected");
    expect(r.out).toContain("subject may not be empty");
    expect(git("status", "--porcelain")).toBe("");
    unlinkSync(hook());
    const r2 = await run("start", P, "--no-worktree");
    expect(r2.code).toBe(0);
    expect(git("log", "-1", "--format=%s")).toBe(`chore(plan): start ${P}`);
  });

  it("done fails cleanly and a rerun succeeds", async () => {
    await run("claim", P, "01");
    git("add", "-A");
    git("commit", "-q", "-m", "claim");
    reject();
    const r = await run("done", P, "01");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("commit rejected");
    expect(git("status", "--porcelain")).toBe("");
    unlinkSync(hook());
    expect((await run("done", P, "01")).code).toBe(0);
    expect(git("log", "-1", "--format=%s")).toBe("chore(plan): done demo 01-first");
  });

  it("archive leaves changes staged", async () => {
    await run("write", P, "proposal", "--section", "Docs impact", "--body", "None - test");
    await run("claim", P, "01");
    await run("done", P, "01");
    mkdirSync(join(dir, "docs"));
    writeFileSync(join(dir, "docs/.keep"), "");
    git("add", "-A");
    git("commit", "-q", "-m", "wip", "--allow-empty");
    git("checkout", "-q", "-b", P);
    reject();
    const r = await run("archive", P, "--commit");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("commit rejected");
    expect(r.out).toContain("Changes are staged");
    expect(git("diff", "--cached", "--name-only")).toContain("specs/changes/archived/");
  });
});
