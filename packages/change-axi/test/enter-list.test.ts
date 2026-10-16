import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { listEnterable } from "../src/enter-list.js";

let dir: string;
let bin: string;
let oldPath: string | undefined;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-el-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-el-bin-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", "alpha", "Alpha");
  await run("step", "add", "alpha", "Do it", "--owns", "src/");
  await run("new", "beta", "Beta");
  git("add", "-A");
  git("commit", "-q", "-m", "plan");
  oldPath = process.env["PATH"];
});
afterEach(() => {
  process.env["PATH"] = oldPath;
  rmSync(dir, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

function fakeTreehouse(status: string): void {
  writeFileSync(join(bin, "status.txt"), status);
  writeFileSync(join(bin, "treehouse"), `#!/bin/sh\ncat "${bin}/status.txt"\n`);
  chmodSync(join(bin, "treehouse"), 0o755);
  process.env["PATH"] = `${bin}${delimiter}${oldPath ?? ""}`;
}

describe("enter --list", () => {
  it("lists one row per active change with worktree and in-flight step", async () => {
    git("branch", "alpha");
    await run("claim", "alpha", "01-do-it"); // in-flight state lives in the main checkout here
    fakeTreehouse(`1     leased       ${dir}  [alpha]\n`);
    const rows = listEnterable({ root: dir });
    expect(rows).toEqual([
      { slug: "alpha", worktree: dir, branch_state: "leased", in_flight: "01-do-it" },
      { slug: "beta", worktree: "-", branch_state: "none", in_flight: "none" },
    ]);
  });

  it("reports an existing branch without a worktree", () => {
    git("branch", "beta");
    fakeTreehouse("");
    expect(listEnterable({ root: dir }).find((r) => r.slug === "beta")?.branch_state).toBe("branch");
  });

  it("works when treehouse is missing", () => {
    // Keep git reachable, drop every PATH dir that has treehouse.
    const keep = (oldPath ?? "").split(delimiter).filter((d) => d && !existsSync(join(d, "treehouse")));
    process.env["PATH"] = keep.join(delimiter);
    const rows = listEnterable({ root: dir });
    expect(rows.map((r) => r.worktree)).toEqual(["-", "-"]);
  });

  it("prints toon rows through the CLI", async () => {
    fakeTreehouse("");
    const r = await run("enter", "--list");
    expect(r.code).toBe(0);
    expect(r.out).toContain("alpha");
    expect(r.out).toContain("beta");
  });

  it("enter without slug or --list errors", async () => {
    const r = await run("enter");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("--list");
  });
});
