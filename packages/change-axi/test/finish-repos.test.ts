import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { main } from "../src/cli.js";
import { finishChange, planRepos } from "../src/finish.js";
import type { RepoRuntime } from "../src/repos.js";
import { leaseRepoWorktree } from "../src/start.js";

const S = "demo-change";
let tmp: string;
let dir: string;
let wt: string;
let bin: string;
let oldPath: string | undefined;
const sh = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<void> => {
  await main({ argv, cwd: dir, stdout: { write: () => true } });
  process.exitCode = undefined;
};

interface Fake {
  rt: RepoRuntime;
  path: string;
  returns: string[];
  failMerge?: boolean;
}

/** Real git repo with a fake treehouse backed by git worktrees. */
function fakeRepo(name: string, o: { failReturn?: boolean } = {}): Fake {
  const path = join(tmp, name);
  mkdirSync(path);
  sh(path, "init", "-q", "-b", "main");
  sh(path, "config", "user.email", "t@t");
  sh(path, "config", "user.name", "t");
  writeFileSync(join(path, "f"), "x");
  sh(path, "add", "-A");
  sh(path, "commit", "-q", "-m", "init");
  const slots: { name: string; path: string; branch: string }[] = [];
  const f: Fake = { path, returns: [], rt: undefined as never };
  f.rt = {
    name,
    path,
    nativePath: path,
    viaWindows: false,
    toNative: (p) => p,
    toWsl: (p) => p,
    git: (args, op = {}) => {
      try {
        const out = execFileSync("git", args, { cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        return op.raw ? out : out.trim();
      } catch (e) {
        if (op.allowFail) return "";
        throw new AxiError(`git ${args[0]} failed: ${(e as Error).message.split("\n")[0]}`, "GIT_ERROR");
      }
    },
    treehouse: (args) => {
      if (args[0] === "status") return JSON.stringify(slots);
      if (args[0] === "return") {
        if (o.failReturn) throw new AxiError("treehouse return failed: busy", "TREEHOUSE_ERROR");
        f.returns.push(args[1] as string);
        const i = slots.findIndex((s) => s.name === args[1]);
        const s = slots[i] as { path: string };
        sh(path, "worktree", "remove", "--force", s.path);
        slots.splice(i, 1);
        return "";
      }
      const branch = args[args.indexOf("-b") + 1] as string;
      const w = join(tmp, `${name}-wt`);
      sh(path, "worktree", "add", "-q", "-b", branch, w, "HEAD");
      slots.push({ name: "1", path: w, branch });
      return JSON.stringify({ path: w });
    },
  };
  return f;
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "change-axi-finrepos-"));
  dir = join(tmp, "plan");
  mkdirSync(dir);
  wt = join(tmp, "plan-wt");
  bin = join(tmp, "bin");
  mkdirSync(bin);
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "config", "user.email", "t@t");
  sh(dir, "config", "user.name", "t");
  await run("new", S, "Demo change");
  await run("step", "add", S, "Do it", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Risks and open questions"]) {
    await run("write", S, "proposal", "--section", s, "--body", "x");
  }
  await run("write", S, "proposal", "--section", "Steps", "--body", "- `01-do-it.md` - it");
  await run("write", S, "proposal", "--section", "Docs impact", "--body", "None - test");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", S, "01", "--section", s, "--body", "x");
  const prop = join(dir, `specs/changes/active/${S}/proposal.md`);
  writeFileSync(prop, readFileSync(prop, "utf8").replace(/^(# .*\n)/, "$1\nRepos: api, web\n"));
  writeFileSync(join(dir, ".plan-axi.toml"), `[repos.api]\npath = "${join(tmp, "api")}"\n\n[repos.web]\npath = "${join(tmp, "web")}"\n`);
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/.gitkeep"), "");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "plan");
  sh(dir, "worktree", "add", "-q", "-b", S, wt);
  writeFileSync(join(bin, "treehouse"), `#!/bin/sh\nif [ "$1" = status ]; then echo "1  ${wt} [${S}]"; fi\n`);
  chmodSync(join(bin, "treehouse"), 0o755);
  oldPath = process.env["PATH"];
  process.env["PATH"] = `${bin}:${oldPath}`;
  execFileSync("tasks-axi", ["start", "01-do-it", "--file", `specs/changes/active/${S}/tasks.md`], { cwd: wt });
  execFileSync("tasks-axi", ["done", "01-do-it", "--file", `specs/changes/active/${S}/tasks.md`], { cwd: wt });
  sh(wt, "add", "-A");
  sh(wt, "commit", "-q", "-m", "work");
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  rmSync(tmp, { recursive: true, force: true });
});

function setup(o: { failReturn?: boolean } = {}): { api: Fake; web: Fake; rts: Map<string, RepoRuntime>; apiWt: string; webWt: string } {
  const api = fakeRepo("api", o);
  const web = fakeRepo("web");
  const apiWt = leaseRepoWorktree(api.rt, S).path;
  const webWt = leaseRepoWorktree(web.rt, S).path;
  return { api, web, rts: new Map([["api", api.rt], ["web", web.rt]]), apiWt, webWt };
}
const commit = (w: string, f: string): void => {
  writeFileSync(join(w, f), f);
  sh(w, "add", "-A");
  sh(w, "commit", "-q", "-m", f);
};
const opts = (rts: Map<string, RepoRuntime>, extra: object = {}) => ({ dryRun: false, skipDocsCheck: true, deleteBranch: false, runtimes: rts, ...extra });

describe("finish across repos", { timeout: 30000 }, () => {
  it("dry run lists ahead/behind and rebase command, real finish refuses and merges nothing", () => {
    const { api, web, rts, apiWt, webWt } = setup();
    commit(apiWt, "a1");
    commit(webWt, "w1");
    commit(web.path, "w-main"); // web base moved: rebase needed
    const plans = planRepos({ root: dir }, S, rts);
    expect(plans.map((p) => [p.repo, p.state, p.ahead, p.behind])).toEqual([["api", "ready", "1", "0"], ["web", "rebase-needed", "1", "1"]]);
    expect(plans[1]?.note).toBe(`git -C ${webWt} rebase main`);
    const dry = finishChange({ root: dir }, S, opts(rts, { dryRun: true }));
    expect(dry.ready).toBe(false);
    expect(dry.repos?.[1]).toMatchObject({ repo: "web", state: "rebase-needed" });
    expect(() => finishChange({ root: dir }, S, opts(rts))).toThrow(/1 repo\(s\) not ready/);
    expect(sh(api.path, "log", "-1", "--format=%s")).toBe("init");
    expect(sh(dir, "log", "-1", "--format=%s")).toBe("plan");
  });

  it("refuses when a worktree is dirty", () => {
    const { rts, apiWt } = setup();
    commit(apiWt, "a1");
    writeFileSync(join(apiWt, "f"), "changed");
    const plans = planRepos({ root: dir }, S, rts);
    expect(plans[0]?.state).toBe("dirty");
    expect(() => finishChange({ root: dir }, S, opts(rts))).toThrow(/not ready/);
  });

  it("merges every repo, returns leases, plan repo last", () => {
    const { api, web, rts, apiWt, webWt } = setup();
    commit(apiWt, "a1");
    commit(webWt, "w1");
    const r = finishChange({ root: dir }, S, opts(rts, { deleteBranch: true }));
    expect(r.repos?.map((x) => x["state"])).toEqual(["merged", "merged"]);
    expect(existsSync(join(api.path, "a1"))).toBe(true);
    expect(existsSync(join(web.path, "w1"))).toBe(true);
    expect(api.returns).toEqual(["1"]);
    expect(sh(api.path, "branch", "--list", S)).toBe("");
    expect(sh(dir, "rev-parse", "HEAD")).toBe(sh(wt, "rev-parse", "HEAD"));
  });

  it("partial failure reports merged and pending; rerun skips merged repos", () => {
    const { api, web, rts, apiWt, webWt } = setup();
    commit(apiWt, "a1");
    commit(webWt, "w1");
    // make web's ff merge fail after api merged by wrapping its git
    const realGit = web.rt.git;
    let fail = true;
    web.rt.git = (args, op) => {
      if (fail && args[0] === "merge") throw new AxiError("git merge failed: boom", "GIT_ERROR");
      return realGit(args, op);
    };
    let err: AxiError | undefined;
    try {
      finishChange({ root: dir }, S, opts(rts, { deleteBranch: true }));
    } catch (e) {
      err = e as AxiError;
    }
    expect(err?.message).toContain("repo web");
    expect(err?.suggestions).toContain("merged: api");
    expect(err?.suggestions.join("\n")).toContain("pending: web, plus the plan repo");
    expect(sh(dir, "log", "-1", "--format=%s")).not.toContain("archive");
    expect(sh(dir, "rev-parse", "HEAD")).not.toBe(sh(wt, "rev-parse", "HEAD"));
    fail = false;
    const r = finishChange({ root: dir }, S, opts(rts, { deleteBranch: true }));
    expect(r.repos?.map((x) => x["state"])).toEqual(["merged", "merged"]);
    expect(api.returns).toEqual(["1"]); // not returned twice
    expect(r.returned.map((x) => `${x.repo}:${x.status}`)).toEqual(["plan:returned", "api:none found", "web:returned"]);
    expect(existsSync(join(web.path, "w1"))).toBe(true);
    expect(sh(dir, "rev-parse", "HEAD")).toBe(sh(wt, "rev-parse", "HEAD"));
  });

  it("single-repo change reports no repos", () => {
    const prop = join(dir, `specs/changes/active/${S}/proposal.md`);
    expect(planRepos({ root: dir }, S, new Map())).toHaveLength(2);
    writeFileSync(prop, readFileSync(prop, "utf8").replace("Repos: api, web\n", ""));
    expect(planRepos({ root: dir }, S, new Map())).toEqual([]);
  });
});
