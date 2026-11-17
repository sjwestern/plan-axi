import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { main } from "../src/cli.js";
import { checkChange } from "../src/check.js";
import { done } from "../src/done.js";
import { finishChange } from "../src/finish.js";
import type { RepoRuntime } from "../src/repos.js";
import { leaseRepoWorktree } from "../src/start.js";

const S = "demo-change";
let tmp: string;
let dir: string;
let wt: string;
let bin: string;
let oldPath: string | undefined;
const sh = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
const run = async (cwd: string, ...argv: string[]): Promise<void> => {
  await main({ argv, cwd, stdout: { write: () => true } });
  process.exitCode = undefined;
};

/** Real git repo with a fake treehouse backed by git worktrees. */
function codeRepo(name: string): { rt: RepoRuntime; path: string } {
  const path = join(tmp, name);
  mkdirSync(path);
  sh(path, "init", "-q", "-b", "main");
  sh(path, "config", "user.email", "t@t");
  sh(path, "config", "user.name", "t");
  writeFileSync(join(path, "f"), "x");
  sh(path, "add", "-A");
  sh(path, "commit", "-q", "-m", "init");
  const slots: { name: string; path: string; branch: string }[] = [];
  const rt: RepoRuntime = {
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
        const i = slots.findIndex((s) => s.name === args[1]);
        sh(path, "worktree", "remove", "--force", (slots[i] as { path: string }).path);
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
  return { rt, path };
}

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), "change-axi-codeless-"));
  dir = join(tmp, "plan");
  mkdirSync(dir);
  wt = join(tmp, "plan-wt");
  bin = join(tmp, "bin");
  mkdirSync(bin);
  sh(dir, "init", "-q", "-b", "main");
  sh(dir, "config", "user.email", "t@t");
  sh(dir, "config", "user.name", "t");
  // The plan repo holds only config and docs: no package.json, no src, no AGENTS.md.
  writeFileSync(join(dir, ".plan-axi.toml"), `[repos.api]\npath = "${join(tmp, "api")}"\n`);
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/.gitkeep"), "");
  await run(dir, "new", S, "Demo change");
  await run(dir, "step", "add", S, "Do it", "--owns", "api:src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Risks and open questions"]) {
    await run(dir, "write", S, "proposal", "--section", s, "--body", "x");
  }
  await run(dir, "write", S, "proposal", "--section", "Steps", "--body", "- `01-do-it.md` - it");
  await run(dir, "write", S, "proposal", "--section", "Docs impact", "--body", "None - test");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run(dir, "write", S, "01", "--section", s, "--body", "x");
  const prop = join(dir, `specs/changes/active/${S}/proposal.md`);
  writeFileSync(prop, readFileSync(prop, "utf8").replace(/^(# .*\n)/, "$1\nRepos: api\n"));
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "plan");
  sh(dir, "worktree", "add", "-q", "-b", S, wt);
  writeFileSync(join(bin, "treehouse"), `#!/bin/sh\nif [ "$1" = status ]; then echo "1  ${wt} [${S}]"; fi\n`);
  chmodSync(join(bin, "treehouse"), 0o755);
  oldPath = process.env["PATH"];
  process.env["PATH"] = `${bin}:${oldPath}`;
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  rmSync(tmp, { recursive: true, force: true });
});

describe("plan repo with no code", { timeout: 30000 }, () => {
  it("runs new, step add, check, claim, done and finish with changes in another repo", () => {
    expect(readdirSync(dir).filter((f) => ["package.json", "src", "AGENTS.md"].includes(f))).toEqual([]);
    const ctx = { root: wt };
    const checked = checkChange(ctx as never, S);
    expect(checked.errors).toEqual([]);
    expect(checked.steps).toBe(1);

    const api = codeRepo("api");
    const apiWt = leaseRepoWorktree(api.rt, S).path;
    const tasks = `specs/changes/active/${S}/tasks.md`;
    execFileSync("tasks-axi", ["start", "01-do-it", "--file", tasks], { cwd: wt });
    mkdirSync(join(apiWt, "src"));
    writeFileSync(join(apiWt, "src/a.ts"), "1");
    sh(apiWt, "add", "-A");
    sh(apiWt, "commit", "-q", "-m", "work");

    const rts = new Map([["api", api.rt]]);
    const r = done(ctx as never, S, "01-do-it", undefined, rts);
    expect(r.warnings).toEqual([]);

    const fin = finishChange({ root: dir }, S, { dryRun: false, skipDocsCheck: true, deleteBranch: false, runtimes: rts });
    expect(fin.repos?.map((x) => x["state"])).toEqual(["merged"]);
    expect(fin.buildHint).toBeUndefined();
    expect(existsSync(join(api.path, "src/a.ts"))).toBe(true);
    expect(sh(dir, "rev-parse", "HEAD")).toBe(sh(wt, "rev-parse", "HEAD"));
  });
});
