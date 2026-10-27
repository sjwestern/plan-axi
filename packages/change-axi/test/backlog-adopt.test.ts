import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import { getBacklogItem } from "../src/change.js";
import { runTasks } from "../src/tasks.js";

let dir: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const item = (slug: string) => getBacklogItem({ root: dir }, slug);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-adopt-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("new adopts unplanned items", () => {
  it("promotes an idea in place and seeds Why from the body", async () => {
    await run("idea", "dark mode", "--slug", "add-dark-mode", "--body", "Users want it.");
    const r = await run("new", "add-dark-mode");
    expect(r.code).toBe(0);
    expect(r.out).toContain("adopted");
    expect(item("add-dark-mode")?.kind).toBe("change");
    expect(item("add-dark-mode")?.title).toBe("dark mode");
    const proposal = readFileSync(join(dir, "specs/changes/active/add-dark-mode/proposal.md"), "utf8");
    expect(proposal).toMatch(/## Why\n\nUsers want it\.\n/);
    expect(proposal.startsWith("# dark mode")).toBe(true);
  });

  it("adopts with a new title", async () => {
    await run("idea", "dark mode", "--slug", "add-dark-mode");
    await run("new", "add-dark-mode", "Add dark mode");
    expect(item("add-dark-mode")?.title).toBe("Add dark mode");
  });

  it("still errors for a planned change, active or archived", async () => {
    await run("new", "add-auth", "Add auth");
    const r = await run("new", "add-auth", "Again");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("is taken");
    // planned in backlog only (kind change, no dir)
    runTasks(dir, ["add", "ghost-plan", "Ghost", "--kind", "change", "--file", "backlog.md"]);
    const g = await run("new", "ghost-plan", "Ghost");
    expect(g.code).not.toBe(0);
    expect(g.out).toContain("already in backlog.md");
  });

  it("needs a title for a brand-new slug", async () => {
    const r = await run("new", "add-thing");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("title is required");
    expect(existsSync(join(dir, "specs/changes/active/add-thing"))).toBe(false);
  });
});

describe("new --from", () => {
  it("renames and carries title, body, priority, repo, blockers", async () => {
    await run("idea", "blocker", "--slug", "other-thing");
    await run("idea", "dark mode", "--slug", "old-slug", "--body", "why text", "--priority", "2", "--repo", "web");
    runTasks(dir, ["block", "old-slug", "--by", "other-thing", "--file", "backlog.md"]);
    const r = await run("new", "add-dark-mode", "--from", "old-slug");
    expect(r.code).toBe(0);
    expect(r.out).toContain("other-thing");
    expect(item("old-slug")).toBeUndefined();
    const n = item("add-dark-mode");
    expect(n).toMatchObject({ kind: "change", title: "dark mode", body: "why text", priority: "2", repo: "web", blockedBy: ["other-thing"] });
    expect(readFileSync(join(dir, "specs/changes/active/add-dark-mode/proposal.md"), "utf8")).toContain("why text");
  });

  it("rejects a non-unplanned or missing source and a taken target", async () => {
    await run("new", "add-auth", "Add auth");
    expect((await run("new", "x-thing", "--from", "add-auth")).code).not.toBe(0);
    expect((await run("new", "x-thing", "--from", "nope")).code).not.toBe(0);
    await run("idea", "one", "--slug", "idea-one");
    const r = await run("new", "add-auth", "--from", "idea-one");
    expect(r.code).not.toBe(0);
    expect(item("idea-one")).toBeDefined();
  });

  it("rolls back when the old item cannot be removed", async () => {
    await run("idea", "dark mode", "--slug", "old-slug");
    await run("idea", "dependent", "--slug", "dep-item");
    runTasks(dir, ["block", "dep-item", "--by", "old-slug", "--file", "backlog.md"]);
    const r = await run("new", "add-dark-mode", "--from", "old-slug");
    expect(r.code).not.toBe(0);
    expect(item("add-dark-mode")).toBeUndefined();
    expect(item("old-slug")?.kind).toBe("idea");
    expect(existsSync(join(dir, "specs/changes/active/add-dark-mode"))).toBe(false);
  });
});

describe("start and where", () => {
  it("start refuses an unplanned item", async () => {
    await run("idea", "dark mode", "--slug", "add-dark-mode");
    const r = await run("start", "add-dark-mode");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("propose it first");
    expect(r.out).toContain("change-axi new add-dark-mode");
  });

  it("where reports backlog state with kind", async () => {
    await run("idea", "crash", "--kind", "bug", "--slug", "fix-crash");
    const r = await run("where", "fix-crash");
    expect(r.out).toContain("state: backlog");
    expect(r.out).toContain("kind: bug");
  });
});
