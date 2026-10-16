import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveEnterSlug } from "../src/commands.js";
import { main } from "../src/cli.js";
import { runTasks } from "../src/tasks.js";

let dir: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const ctx = (): { root: string } => ({ root: dir });
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const startInBacklog = (slug: string): void => {
  runTasks(dir, ["start", slug, "--file", "backlog.md"]);
};
const noTty = { tty: false, ask: () => undefined };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-pick-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
});
afterEach(() => {
  process.exitCode = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function plans(...slugs: string[]): Promise<void> {
  for (const s of slugs) {
    await run("new", s, s);
    await run("step", "add", s, "Do it", "--owns", "src/");
  }
  git("add", "-A");
  git("commit", "-q", "-m", "plans");
}

describe("slug-less enter", () => {
  it("uses the only in-flight change", async () => {
    await plans("alpha", "beta");
    startInBacklog("beta");
    expect(resolveEnterSlug(ctx(), noTty)).toEqual({ slug: "beta" });
  });

  it("uses the change on the current branch", async () => {
    await plans("alpha", "beta");
    git("switch", "-q", "-c", "alpha");
    expect(resolveEnterSlug(ctx(), noTty)).toEqual({ slug: "alpha" });
  });

  it("several in flight, no TTY: prints the list and exits 1", async () => {
    await plans("alpha", "beta", "gamma");
    startInBacklog("alpha");
    startInBacklog("beta");
    const r = resolveEnterSlug(ctx(), noTty);
    expect(process.exitCode).toBe(1);
    expect("output" in r).toBe(true);
    const rows = ((r as { output: { changes: { slug: string }[] } }).output.changes).map((x) => x.slug);
    expect(rows).toEqual(["alpha", "beta"]);
  });

  it("several in flight, TTY: numbered prompt picks the answer", async () => {
    await plans("alpha", "beta");
    startInBacklog("alpha");
    startInBacklog("beta");
    let shown = "";
    const r = resolveEnterSlug(ctx(), { tty: true, ask: (p) => ((shown = p), "2") });
    expect(r).toEqual({ slug: "beta" });
    expect(shown).toContain("1) alpha");
    expect(shown).toContain("2) beta");
  });

  it("TTY: invalid answer errors", async () => {
    await plans("alpha", "beta");
    startInBacklog("alpha");
    startInBacklog("beta");
    expect(() => resolveEnterSlug(ctx(), { tty: true, ask: () => "9" })).toThrow(/no valid choice/);
    expect(() => resolveEnterSlug(ctx(), { tty: true, ask: () => undefined })).toThrow(/no valid choice/);
  });

  it("none in flight: picks among all active changes", async () => {
    await plans("alpha", "beta");
    const r = resolveEnterSlug(ctx(), { tty: true, ask: () => "1" });
    expect(r).toEqual({ slug: "alpha" });
  });

  it("no active changes: hints at change-axi", () => {
    expect(() => resolveEnterSlug(ctx(), noTty)).toThrow(/no active changes/);
  });

  it("CLI: no slug with several changes lists them and exits 1", async () => {
    await plans("alpha", "beta");
    startInBacklog("alpha");
    startInBacklog("beta");
    const r = await run("enter");
    expect(r.code).toBe(1);
    expect(r.out).toContain("alpha");
    expect(r.out).toContain("beta");
  });
});
