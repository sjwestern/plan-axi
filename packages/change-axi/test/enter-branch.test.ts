import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { leaseWorktree } from "../src/start.js";

const S = "demo-change";
let dir: string;
let bin: string;
let wt: string;
let oldPath: string | undefined;
let oldXdg: string | undefined;

const git = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ctx = (): { root: string } => ({ root: dir });
const hasBranch = (b: string): boolean => {
  try {
    git(dir, "rev-parse", "--verify", "--quiet", `refs/heads/${b}`);
    return true;
  } catch {
    return false;
  }
};
const commit = (cwd: string, file: string): void => {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
};
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-eb-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-eb-bin-"));
  wt = join(bin, "wt");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  commit(dir, "a.txt");
  // Fake treehouse: `status` prints $bin/status; `get` leases a git worktree at $bin/wt (-b creates the branch).
  const script = `#!/bin/sh
if [ "$1" = status ]; then cat "${bin}/status" 2>/dev/null || true
elif [ "$1" = get ]; then
  [ -d "${wt}" ] || git -C "${dir}" worktree add -q --detach "${wt}" >/dev/null 2>&1
  if [ "$3" = "--json" ] && [ "$4" = "-b" ]; then git -C "${wt}" switch -q -c "$5" >/dev/null 2>&1; fi
  printf '{"path":"%s"}\\n' "${wt}"
fi
`;
  writeFileSync(join(bin, "treehouse"), script);
  chmodSync(join(bin, "treehouse"), 0o755);
  oldPath = process.env["PATH"];
  oldXdg = process.env["XDG_CONFIG_HOME"];
  process.env["PATH"] = `${bin}${delimiter}${oldPath ?? ""}`;
  process.env["XDG_CONFIG_HOME"] = bin;
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  if (oldXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = oldXdg;
  try {
    git(dir, "worktree", "prune");
  } catch {
    /* ignore */
  }
  rmSync(dir, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

describe("leaseWorktree with an existing branch", () => {
  it("recreates a branch equal to main", () => {
    git(dir, "branch", S);
    const w = leaseWorktree(ctx(), S);
    expect(w.reused).toBe(false);
    expect(git(w.path, "branch", "--show-current")).toBe(S);
  });

  it("recreates a branch behind main", () => {
    git(dir, "branch", S);
    commit(dir, "b.txt");
    const w = leaseWorktree(ctx(), S);
    expect(git(w.path, "branch", "--show-current")).toBe(S);
    expect(git(w.path, "rev-parse", "HEAD")).toBe(git(dir, "rev-parse", "main"));
  });

  it("switches to a branch with commits and keeps them", () => {
    git(dir, "switch", "-q", "-c", S);
    commit(dir, "work.txt");
    const head = git(dir, "rev-parse", "HEAD");
    git(dir, "switch", "-q", "main");
    const w = leaseWorktree(ctx(), S);
    expect(git(w.path, "branch", "--show-current")).toBe(S);
    expect(git(w.path, "rev-parse", "HEAD")).toBe(head);
  });

  it("errors with guidance and keeps the branch when comparison fails", async () => {
    git(dir, "branch", S);
    git(dir, "branch", "-m", "main", "trunk"); // default branch no longer main/master
    let err: unknown;
    try {
      leaseWorktree(ctx(), S);
    } catch (e) {
      err = e;
    }
    const e = err as { code?: string; message: string; suggestions?: string[] };
    expect(e.code).toBe("VALIDATION_ERROR");
    expect(e.message).toContain("could not be compared");
    expect(JSON.stringify(e)).toContain("git log");
    expect(hasBranch(S)).toBe(true);
  });

  it("reuses a branch already in a pool worktree", () => {
    writeFileSync(join(bin, "status"), `1     leased       ${wt}  [${S}]\n`);
    const w = leaseWorktree(ctx(), S);
    expect(w).toEqual({ path: wt, name: "1", reused: true });
  });

  it("reports GIT_ERROR when switch fails", () => {
    git(dir, "switch", "-q", "-c", S);
    commit(dir, "work.txt"); // has work, and stays checked out in the main repo
    let err: unknown;
    try {
      leaseWorktree(ctx(), S);
    } catch (e) {
      err = e;
    }
    expect((err as { code?: string }).code).toBe("GIT_ERROR");
    expect((err as Error).message).toContain(`git switch ${S} failed`);
  });
});

describe("enter resume", () => {
  const setup = async (claims: string[]): Promise<void> => {
    await run("new", S, "Demo change");
    await run("step", "add", S, "Do it", "--owns", "src/");
    await run("step", "add", S, "Do more", "--owns", "lib/");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "plan");
    git(dir, "switch", "-q", "-c", S);
    for (const c of claims) await run("claim", S, c);
  };

  it("resumes the single in-flight step", async () => {
    await setup(["01-do-it"]);
    const r = await run("enter", S, "--print");
    expect(r.out).toContain("Resuming in-flight step 01-do-it");
    expect(r.out).toContain(`apply ${S} 01-do-it`);
  });

  it("does not resume with zero in-flight steps", async () => {
    await setup([]);
    const r = await run("enter", S, "--print");
    expect(r.out).not.toContain("Resuming");
    expect(r.out).toContain(`apply ${S}`);
    expect(r.out).not.toContain(`apply ${S} 0`);
  });

  it("does not resume with two in-flight steps", async () => {
    await setup(["01-do-it", "02-do-more"]);
    const r = await run("enter", S, "--print");
    expect(r.out).not.toContain("Resuming");
    expect(r.out).not.toContain(`apply ${S} 0`);
  });
});
