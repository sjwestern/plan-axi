import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { done } from "../src/done.js";
import { repoStates } from "../src/repostate.js";
import { leaseRepoWorktree } from "../src/start.js";
import type { RepoRuntime } from "../src/repos.js";

let tmp: string;
const sh = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

function runtime(name: string, path: string): RepoRuntime {
  const slots: { name: string; path: string; branch: string }[] = [];
  return {
    name,
    path,
    nativePath: path,
    viaWindows: false,
    toNative: (p) => p,
    toWsl: (p) => p,
    git: (args, o = {}) => {
      try {
        return execFileSync("git", args, { cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })[o.raw ? "toString" : "trim"]();
      } catch (e) {
        if (o.allowFail) return "";
        throw e;
      }
    },
    treehouse: (args) => {
      if (args[0] === "status") return JSON.stringify(slots);
      const branch = args[args.indexOf("-b") + 1] as string;
      const wt = join(tmp, `${name}-wt`);
      sh(path, "worktree", "add", "-q", "-b", branch, wt, "HEAD");
      slots.push({ name: "1", path: wt, branch });
      return JSON.stringify({ path: wt });
    },
  };
}

function mkRepo(name: string): string {
  const p = join(tmp, name);
  mkdirSync(p);
  sh(p, "init", "-q", "-b", "main");
  sh(p, "config", "user.email", "t@t");
  sh(p, "config", "user.name", "t");
  writeFileSync(join(p, "f"), "x");
  sh(p, "add", "-A");
  sh(p, "commit", "-q", "-m", "init");
  return p;
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "change-axi-state-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function plan(): { root: string } {
  const root = mkRepo("plan");
  const d = join(root, "specs/changes/active/chg");
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "proposal.md"), "# Chg\n\nRepos: api\n\n## Why\n\nx\n");
  return { root };
}

describe("repoStates", () => {
  it("empty for single-repo change", () => {
    const root = mkRepo("plan");
    mkdirSync(join(root, "specs/changes/active/chg"), { recursive: true });
    writeFileSync(join(root, "specs/changes/active/chg/proposal.md"), "# Chg\n");
    expect(repoStates({ root } as never, "chg", new Map())).toEqual([]);
  });

  it("reports no-worktree, clean, then dirty", () => {
    const ctx = plan();
    const rt = runtime("api", mkRepo("api"));
    const rts = new Map([["api", rt]]);
    expect(repoStates(ctx as never, "chg", rts)[0]).toMatchObject({ repo: "api", state: "no-worktree", base: "main" });
    const wt = leaseRepoWorktree(rt, "chg");
    expect(repoStates(ctx as never, "chg", rts)[0]).toMatchObject({ state: "clean", worktree: wt.path, branch: "chg" });
    writeFileSync(join(wt.path, "new"), "y");
    expect(repoStates(ctx as never, "chg", rts)[0]).toMatchObject({ state: "dirty" });
  });

  it("flags unconfigured repo as unavailable", () => {
    expect(repoStates(plan() as never, "chg", new Map())[0]).toMatchObject({ state: "unavailable" });
  });
});

describe("done in external repo", () => {
  it("flags OUTSIDE_OWNS per repo", () => {
    const ctx = plan();
    const d = join(ctx.root, "specs/changes/active/chg");
    writeFileSync(join(d, "01-a.md"), "# A\n\nOwns: api:src/\n");
    const tasks = "specs/changes/active/chg/tasks.md";
    execFileSync("tasks-axi", ["add", "01-a", "A", "--start", "--file", tasks], { cwd: ctx.root });
    const rt = runtime("api", mkRepo("api"));
    const wt = leaseRepoWorktree(rt, "chg");
    mkdirSync(join(wt.path, "src"));
    writeFileSync(join(wt.path, "src/a.ts"), "1");
    writeFileSync(join(wt.path, "other.ts"), "2");
    sh(wt.path, "add", "-A");
    sh(wt.path, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "w");
    sh(ctx.root, "add", "-A");
    sh(ctx.root, "commit", "-q", "-m", "plan");
    const r = done(ctx as never, "chg", "01-a", undefined, new Map([["api", rt]]));
    expect(r.warnings).toEqual([expect.stringContaining("OUTSIDE_OWNS: api:other.ts")]);
    expect(r.warnings[0]).not.toContain("src/a.ts");
  });
});
