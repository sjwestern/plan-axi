import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

const S = "demo-change";
let dir: string;
let wt: string;
let bin: string;
let oldPath: string | undefined;
const sh = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const git = (...a: string[]): string => sh(dir, ...a);
const wgit = (...a: string[]): string => sh(wt, ...a);
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const tasks = (...a: string[]): string => execFileSync("tasks-axi", [...a, "--file", `specs/changes/active/${S}/tasks.md`], { cwd: wt, encoding: "utf8" });
const returnLog = (): string => (existsSync(join(bin, "returned.log")) ? readFileSync(join(bin, "returned.log"), "utf8") : "");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-fin-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-bin-"));
  wt = `${dir}-wt`;
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", S, "Demo change");
  await run("step", "add", S, "Do it", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Risks and open questions"]) {
    await run("write", S, "proposal", "--section", s, "--body", "x");
  }
  await run("write", S, "proposal", "--section", "Steps", "--body", "- `01-do-it.md` - it");
  await run("write", S, "proposal", "--section", "Docs impact", "--body", "None - test");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", S, "01", "--section", s, "--body", "x");
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/.gitkeep"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "plan");
  git("worktree", "add", "-q", "-b", S, wt);
  // fake treehouse
  writeFileSync(join(bin, "treehouse"), `#!/bin/sh\nif [ "$1" = status ]; then echo "1  ${wt} [${S}]"; elif [ "$1" = return ]; then echo "$2" >> "${bin}/returned.log"; if [ -f "${bin}/detach" ]; then git -C "${wt}" checkout -q --detach; fi; fi\n`);
  chmodSync(join(bin, "treehouse"), 0o755);
  oldPath = process.env["PATH"];
  process.env["PATH"] = `${bin}:${oldPath}`;
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  rmSync(dir, { recursive: true, force: true });
  rmSync(wt, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

function completeStep(): void {
  tasks("start", "01-do-it");
  tasks("done", "01-do-it");
  wgit("add", "-A");
  wgit("commit", "-q", "-m", "work");
}

describe("finish", () => {
  it("archives on the branch, merges, returns the worktree", async () => {
    completeStep();
    const r = await run("finish", S);
    expect(r.code).toBe(0);
    expect(r.out).toContain("finished");
    expect(git("log", "-1", "--format=%s")).toBe("chore(plan): archive change");
    expect(git("rev-parse", "HEAD")).toBe(wgit("rev-parse", "HEAD"));
    expect(existsSync(join(dir, `specs/changes/active/${S}`))).toBe(false);
    expect(returnLog().trim()).toBe("1");
  });

  it("skips archiving when already archived", async () => {
    completeStep();
    const a = await run("archive", S, "--commit", "--root", wt);
    expect(a.code).toBe(0);
    const tip = wgit("rev-parse", "HEAD");
    const r = await run("finish", S);
    expect(r.code).toBe(0);
    expect(r.out).toContain("skipped");
    expect(wgit("rev-parse", "HEAD")).toBe(tip);
    expect(git("rev-parse", "HEAD")).toBe(tip);
  });

  it("refuses with unfinished tasks", async () => {
    const head = git("rev-parse", "HEAD");
    const r = await run("finish", S);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("not done");
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(wgit("rev-parse", "HEAD")).toBe(head);
    expect(returnLog()).toBe("");
  });

  it("refuses a dirty main", async () => {
    completeStep();
    writeFileSync(join(dir, "backlog.md"), "dirty\n");
    const tip = wgit("rev-parse", "HEAD");
    const r = await run("finish", S);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("uncommitted");
    expect(wgit("rev-parse", "HEAD")).toBe(tip);
  });

  it("refuses a diverged branch", async () => {
    completeStep();
    writeFileSync(join(dir, "other.txt"), "x");
    git("add", "other.txt");
    git("commit", "-q", "-m", "other");
    const head = git("rev-parse", "HEAD");
    const tip = wgit("rev-parse", "HEAD");
    const r = await run("finish", S);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("rebase");
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(wgit("rev-parse", "HEAD")).toBe(tip);
  });

  it("dry run changes nothing", async () => {
    completeStep();
    const head = git("rev-parse", "HEAD");
    const tip = wgit("rev-parse", "HEAD");
    const r = await run("finish", S, "--dry-run");
    expect(r.code).toBe(0);
    expect(r.out).toContain("dry run");
    expect(git("rev-parse", "HEAD")).toBe(head);
    expect(wgit("rev-parse", "HEAD")).toBe(tip);
    expect(existsSync(join(wt, `specs/changes/active/${S}`))).toBe(true);
    expect(returnLog()).toBe("");
  });

  it("--delete-branch removes the branch after return", async () => {
    completeStep();
    writeFileSync(join(bin, "detach"), "");
    const r = await run("finish", S, "--delete-branch");
    expect(r.code).toBe(0);
    expect(r.out).toContain("branch_deleted");
    expect(git("branch", "--list", S)).toBe("");
  });

  it("keeps the branch without the flag", async () => {
    completeStep();
    writeFileSync(join(bin, "detach"), "");
    const r = await run("finish", S);
    expect(r.code).toBe(0);
    expect(git("branch", "--list", S)).not.toBe("");
  });

  it("dry run with --delete-branch keeps the branch", async () => {
    completeStep();
    const r = await run("finish", S, "--dry-run", "--delete-branch");
    expect(r.code).toBe(0);
    expect(r.out).toContain(`planned: delete ${S}`);
    expect(git("branch", "--list", S)).not.toBe("");
  });

  it("warns and exits 0 when the branch cannot be deleted", async () => {
    completeStep();
    const r = await run("finish", S, "--delete-branch");
    expect(r.code).toBe(0);
    expect(r.out).toContain("could not delete");
    expect(git("branch", "--list", S)).not.toBe("");
  });

  describe("resumable after a stuck return", () => {
    // Fake treehouse with JSON status: the first return resets the slot (detached, holder kept) and fails.
    const stuckFake = (holder: string): void => {
      const script = `#!/bin/sh
st() {
  if [ -f "${bin}/reset" ]; then b=""; else b="${S}"; fi
  echo '[{"name":"1","path":"${wt}","status":"leased","branch":"'"$b"'","lease_holder":"${holder}"}]'
}
if [ "$1" = status ] && [ "$2" = --json ]; then st
elif [ "$1" = return ]; then
  echo "$2" >> "${bin}/returned.log"
  if [ ! -f "${bin}/once" ]; then touch "${bin}/once" "${bin}/reset"; git -C "${wt}" checkout -q --detach; echo "live processes after termination: code (1)" >&2; exit 1; fi
  rm -f "${bin}/reset"; git -C "${wt}" checkout -q --detach
fi
`;
      writeFileSync(join(bin, "treehouse"), script);
    };

    it("second finish returns the slot and deletes the branch without merging again", async () => {
      completeStep();
      stuckFake(S);
      const first = await run("finish", S, "--delete-branch");
      expect(first.code).toBe(0);
      expect(first.out).toContain("rerun");
      expect(first.out).toContain("slot 1");
      expect(git("branch", "--list", S)).not.toBe("");
      const head = git("rev-parse", "HEAD");
      const second = await run("finish", S, "--delete-branch");
      expect(second.code).toBe(0);
      expect(second.out).toContain(`already in main`);
      expect(returnLog().trim().split("\n")).toEqual(["1", "1"]);
      expect(git("branch", "--list", S)).toBe("");
      expect(git("rev-parse", "HEAD")).toBe(head);
      expect(git("log", "-1", "--format=%s")).toBe("chore(plan): archive change");
    });

    it("holder-less slot: succeeds with a manual hint", async () => {
      completeStep();
      stuckFake("");
      await run("finish", S);
      const head = git("rev-parse", "HEAD");
      const r = await run("finish", S);
      expect(r.code).toBe(0);
      expect(r.out).toContain("treehouse return <name>");
      expect(git("rev-parse", "HEAD")).toBe(head);
    });

    it("unmerged branch with no worktree keeps NOT_FOUND", async () => {
      completeStep();
      stuckFake("other");
      writeFileSync(join(bin, "reset"), "");
      const r = await run("finish", S);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("no treehouse worktree");
    });
  });
});
