import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string | undefined;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const plan = async (P: string): Promise<void> => {
  await run("new", P, "Demo");
  await run("step", "add", P, "First", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Docs impact", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", "x");
  }
  await run("write", P, "proposal", "--section", "Steps", "--body", "- `01-first.md` - it");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01", "--section", s, "--body", "x");
};
const body = (): string => git("log", "-1", "--format=%B");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-cplan-"));
  xdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = join(dir, "no-user-config");
  process.env["TASKS_AXI_FILE"] = "";
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(dir, ".gitignore"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => {
  if (xdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = xdg;
  rmSync(dir, { recursive: true, force: true });
});

describe("commit-plan", () => {
  it("reports backlog.md in files and prints unmangled warning paths", async () => {
    writeFileSync(join(dir, "backlog.md"), "# b\n");
    git("add", "-A");
    git("commit", "-q", "-m", "backlog");
    await plan("demo");
    writeFileSync(join(dir, "stray.txt"), "x");
    const { out } = await run("commit-plan", "--dry-run");
    expect(out).toContain("backlog.md");
    expect(out).toContain("stray.txt");
    expect(out).not.toMatch(/[^b]acklog\.md/);
  });
  it("auto-detects the one plan, default message and trailer", async () => {
    await plan("demo");
    const r = await run("commit-plan");
    expect(r.code).toBe(0);
    expect(body()).toBe("docs(plan): propose demo\n\nChange: demo");
    expect(git("status", "--porcelain")).toBe("");
  });

  it("none -> NOTHING_TO_COMMIT", async () => {
    const r = await run("commit-plan");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("NOTHING_TO_COMMIT");
  });

  it("several -> lists them; explicit slug works", async () => {
    await plan("aaa");
    await plan("bbb");
    const r = await run("commit-plan");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("aaa");
    expect(r.out).toContain("bbb");
    expect((await run("commit-plan", "aaa")).code).toBe(0);
    expect(body()).toContain("propose aaa");
  });

  it("applies config overrides", async () => {
    writeFileSync(join(dir, ".plan-axi.toml"), '[commit]\nplan_type = "feat"\nscope = ""\ntrailer = ""\n');
    git("add", ".plan-axi.toml");
    git("commit", "-q", "-m", "cfg");
    await plan("demo");
    await run("commit-plan");
    expect(body()).toBe("feat: propose demo");
  });

  it("--reason sets the subject", async () => {
    await plan("demo");
    await run("commit-plan", "--reason", "drop step 03");
    expect(git("log", "-1", "--format=%s")).toBe("docs(plan): drop step 03");
  });

  it("leaves other dirty files unstaged and warns", async () => {
    await plan("demo");
    writeFileSync(join(dir, "other.txt"), "x");
    const r = await run("commit-plan");
    expect(r.out).toContain("other.txt");
    expect(git("status", "--porcelain")).toBe("?? other.txt");
  });

  it("refuses an invalid plan", async () => {
    await plan("demo");
    rmSync(join(dir, "specs/changes/active/demo/01-first.md"));
    const r = await run("commit-plan", "demo");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("plan check failed");
    expect(git("log", "--oneline")).not.toContain("propose");
  });

  it("--dry-run commits nothing", async () => {
    await plan("demo");
    const r = await run("commit-plan", "--dry-run");
    expect(r.out).toContain("docs(plan): propose demo");
    expect(r.out).toContain("Change: demo");
    expect(git("log", "--oneline").split("\n")).toHaveLength(1);
    expect(git("diff", "--cached", "--name-only")).toBe("");
  });

  it("hook rejection restores the index", async () => {
    await plan("demo");
    const hook = join(dir, ".git/hooks/commit-msg");
    writeFileSync(hook, "#!/bin/sh\necho nope >&2\nexit 1\n");
    chmodSync(hook, 0o755);
    const r = await run("commit-plan");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("commit rejected");
    expect(git("diff", "--cached", "--name-only")).toBe("");
    expect(git("status", "--porcelain")).toContain("specs/");
  });
});
