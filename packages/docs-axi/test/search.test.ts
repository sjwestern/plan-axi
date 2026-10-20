import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(async () => {
  repo = tempRepo();
  await repo.run("init");
  await repo.run("new", "domain", "Worktree launch", "--summary", "Launching worktrees");
  await repo.run("new", "domain", "Worktree cleanup", "--summary", "Removing trees");
  await repo.run("adr", "add", "Launch via enter", "--summary", "Use enter to launch worktree");
});
afterEach(() => repo.cleanup());

describe("search core", () => {
  it("shows a matched N/M column", async () => {
    const r = await repo.run("search", "worktree", "launch");
    expect(r.out).toContain("matched");
    expect(r.out).toContain("2/2");
    expect(r.out).toContain("1/2");
  });

  it("--all excludes partial matches", async () => {
    const r = await repo.run("search", "worktree", "launch", "--all");
    expect(r.out).toContain("worktree-launch.md");
    expect(r.out).toContain("launch-via-enter");
    expect(r.out).not.toContain("worktree-cleanup");
    expect(r.out).not.toContain("1/2");
  });

  it("marks ADRs in mixed results", async () => {
    const r = await repo.run("search", "launch");
    expect(r.out).toContain("ADR-0001");
    expect(r.out).toContain("kind");
    const l = await repo.run("list");
    expect(l.out).toContain("ADR-0001");
    const noAdr = await repo.run("list", "domain");
    expect(noAdr.out).not.toContain("kind");
  });

  it("errors on unknown flags", async () => {
    const r = await repo.run("search", "launch", "--bogus");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("--bogus");
  });

  it("reports 0 matches, also with --all", async () => {
    expect((await repo.run("search", "zzzz")).out).toContain("0 matches for: zzzz");
    expect((await repo.run("search", "launch", "zzzz", "--all")).out).toContain("0 matches for: launch zzzz");
  });

  it("list --status still works", async () => {
    const r = await repo.run("list", "decisions", "--status", "proposed");
    expect(r.out).toContain("launch-via-enter");
  });
});
