import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { diagnose, leaseWorktree } from "../src/start.js";

const S = "demo-change";
let dir: string;
let bin: string;
let oldPath: string | undefined;
const git = (cwd: string, ...a: string[]): string => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ctx = (): { root: string } => ({ root: dir });
const commit = (cwd: string, file: string): void => {
  writeFileSync(join(cwd, file), file);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", file);
};
const lease = (): { code?: string; message: string; suggestions: string[] } => {
  try {
    leaseWorktree(ctx(), S);
  } catch (e) {
    return e as { code?: string; message: string; suggestions: string[] };
  }
  throw new Error("expected failure");
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-dg-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-dg-bin-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  commit(dir, "a.txt");
  // Failing fake treehouse: status is empty, get prints progress noise then fails.
  writeFileSync(join(bin, "treehouse"), `#!/bin/sh\nif [ "$1" = status ]; then exit 0; fi\necho "setting up worktree" >&2\necho "boom: pool exhausted" >&2\nexit 1\n`);
  chmodSync(join(bin, "treehouse"), 0o755);
  oldPath = process.env["PATH"];
  process.env["PATH"] = `${bin}${delimiter}${oldPath ?? ""}`;
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  rmSync(dir, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

describe("treehouse get failures", () => {
  it("unknown cause shows stderr tail", () => {
    const e = lease();
    expect(e.code).toBe("TREEHOUSE_ERROR");
    expect(e.message).toContain("unknown");
    expect(e.message).toContain("boom: pool exhausted");
    expect(e.suggestions[0]).toContain("treehouse status");
  });

  it("branch with commits", () => {
    git(dir, "switch", "-q", "-c", S);
    commit(dir, "w.txt");
    git(dir, "switch", "-q", "main");
    const e = lease();
    expect(e.message).toContain("1 commit(s) beyond main");
    expect(e.suggestions[0]).toContain(`git switch ${S}`);
  });

  it("branch checked out in another worktree", () => {
    const other = join(bin, "other");
    git(dir, "worktree", "add", "-q", "-b", S, other);
    commit(other, "w.txt");
    const e = lease();
    expect(e.message).toContain("checked out in another worktree");
    expect(e.message).toContain("other");
    expect(e.suggestions[0]).toContain("switch --detach");
  });

  it("branch with no commits (direct)", () => {
    git(dir, "branch", S);
    const d = diagnose(ctx(), S);
    expect(d.cause).toContain("no commits beyond main");
    expect(d.hint).toContain(`git branch -D ${S}`);
  });

  it("base unresolved (direct)", () => {
    git(dir, "branch", "-m", "main", "trunk");
    const d = diagnose(ctx(), S);
    expect(d.cause).toContain("base branch main not found");
    expect(d.hint).toContain("git fetch");
  });

  it("causes are distinct", () => {
    git(dir, "branch", S);
    const a = diagnose(ctx(), S).cause;
    git(dir, "branch", "-m", "main", "trunk");
    const b = diagnose(ctx(), S).cause;
    expect(a).not.toBe(b);
  });
});
