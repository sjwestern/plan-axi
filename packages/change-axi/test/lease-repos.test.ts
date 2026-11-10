import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AxiError } from "axi-sdk-js";
import { leaseRepos, leaseRepoWorktree } from "../src/start.js";
import type { RepoRuntime } from "../src/repos.js";

let tmp: string;
const sh = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

/** Runtime backed by a real git repo with a fake treehouse that emulates status/get with git worktrees. */
function fakeRuntime(name: string, path: string, opts: { failGet?: boolean } = {}): { rt: RepoRuntime; gets: string[][] } {
  const gets: string[][] = [];
  const slots: { name: string; path: string; branch?: string }[] = [];
  const rt: RepoRuntime = {
    name,
    path,
    nativePath: path,
    viaWindows: false,
    toNative: (p) => p,
    toWsl: (p) => p,
    git: (args, o = {}) => {
      try {
        return execFileSync("git", args, { cwd: path, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
      } catch (e) {
        if (o.allowFail) return "";
        throw new AxiError(`git failed: ${(e as Error).message}`, "GIT_ERROR");
      }
    },
    treehouse: (args) => {
      if (args[0] === "status") return JSON.stringify(slots.map((s) => ({ name: s.name, path: s.path, ...(s.branch ? { branch: s.branch } : {}) })));
      gets.push(args);
      if (opts.failGet) throw new AxiError("treehouse get failed: boom", "TREEHOUSE_ERROR");
      const branch = args[args.indexOf("-b") + 1] as string;
      const base = args.includes("--base") ? (args[args.indexOf("--base") + 1] as string) : "HEAD";
      const wt = join(tmp, `${name}-wt-${slots.length + 1}`);
      sh(path, "worktree", "add", "-q", "-b", branch, wt, base);
      slots.push({ name: String(slots.length + 1), path: wt, branch });
      return JSON.stringify({ path: wt });
    },
  };
  return { rt, gets };
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
  sh(p, "branch", "release");
  return p;
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "change-axi-lease-"));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("leaseRepoWorktree", () => {
  it("leases on the slug branch from the default branch, then reuses", () => {
    const { rt, gets } = fakeRuntime("api", mkRepo("api"));
    const a = leaseRepoWorktree(rt, "chg");
    expect(a).toMatchObject({ repo: "api", branch: "chg", base: "main", reused: false });
    expect(sh(a.path, "branch", "--show-current")).toBe("chg");
    expect(gets[0]).not.toContain("--base");
    const b = leaseRepoWorktree(rt, "chg");
    expect(b).toMatchObject({ path: a.path, reused: true });
    expect(gets).toHaveLength(1);
  });

  it("passes an explicit base", () => {
    const { rt, gets } = fakeRuntime("api", mkRepo("api"));
    const a = leaseRepoWorktree(rt, "chg", "release");
    expect(a.base).toBe("release");
    expect(gets[0]).toEqual(expect.arrayContaining(["--base", "release"]));
  });
});

describe("leaseRepos", () => {
  const plan = (repos: string): { ctx: { root: string }; slug: string } => {
    const root = join(tmp, "plan");
    const d = join(root, "specs/changes/active/chg");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "proposal.md"), `# Chg\n\n${repos}\n\n## Why\n\nx\n`);
    return { ctx: { root }, slug: "chg" };
  };

  it("single-repo change leases nothing", () => {
    const { ctx, slug } = plan("");
    expect(leaseRepos(ctx as never, slug, new Map())).toEqual([]);
  });

  it("two-repo change leases both and a rerun reuses them", () => {
    const { ctx, slug } = plan("Repos: api@release, web");
    const rts = new Map([
      ["api", fakeRuntime("api", mkRepo("api")).rt],
      ["web", fakeRuntime("web", mkRepo("web")).rt],
    ]);
    const first = leaseRepos(ctx as never, slug, rts);
    expect(first.map((w) => [w.repo, w.base, w.reused])).toEqual([
      ["api", "release", false],
      ["web", "main", false],
    ]);
    const again = leaseRepos(ctx as never, slug, rts);
    expect(again.map((w) => [w.path, w.reused])).toEqual(first.map((w) => [w.path, true]));
  });

  it("reports leases that succeeded when a later one fails", () => {
    const { ctx, slug } = plan("Repos: api, web");
    const rts = new Map([
      ["api", fakeRuntime("api", mkRepo("api")).rt],
      ["web", fakeRuntime("web", mkRepo("web"), { failGet: true }).rt],
    ]);
    let err: AxiError | undefined;
    try {
      leaseRepos(ctx as never, slug, rts);
    } catch (e) {
      err = e as AxiError;
    }
    expect(err?.message).toContain("repo web");
    expect(err?.suggestions.join("\n")).toContain("leased api");
    expect(sh(join(tmp, "api"), "branch", "--list", "chg")).toContain("chg");
  });

  it("rejects an unconfigured repo before leasing", () => {
    const { ctx, slug } = plan("Repos: ghost");
    expect(() => leaseRepos(ctx as never, slug, new Map())).toThrow(/unconfigured/);
  });
});
