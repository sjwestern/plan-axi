import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveSlug, UNPLANNED_KINDS } from "../src/backlog.js";
import { tempRepo } from "./helpers.js";

let t: ReturnType<typeof tempRepo>;
beforeEach(() => {
  t = tempRepo();
});
afterEach(() => t.cleanup());

describe("deriveSlug", () => {
  it("kebab-cases, drops punctuation, keeps the verb first", () => {
    expect(deriveSlug("Fix: the Login bug!")).toBe("fix-the-login-bug");
    expect(deriveSlug("don't crash, ever")).toBe("dont-crash-ever");
  });
  it("caps at 50 chars on a word boundary with no suffix", () => {
    const s = deriveSlug("add a really long title that keeps going well past the limit of fifty characters");
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.startsWith("add-a-really-long")).toBe(true);
    expect(s.endsWith("-")).toBe(false);
  });
  it("exports the unplanned kinds", () => {
    expect([...UNPLANNED_KINDS]).toEqual(["idea", "bug", "chore"]);
  });
});

describe("idea + backlog", () => {
  it("captures kind, priority and repo, then lists them", async () => {
    const r = await t.run("idea", "dark mode toggle", "--kind", "chore", "--priority", "1", "--repo", "web");
    expect(r.code).toBe(0);
    expect(r.out).toContain("dark-mode-toggle queued");
    const l = await t.run("backlog");
    expect(l.out).toContain("dark-mode-toggle");
    expect(l.out).toMatch(/chore/);
    expect(l.out).toMatch(/web/);
    expect(l.out).toMatch(/,1,/);
  });

  it("defaults kind to idea and honors --slug and --body", async () => {
    const r = await t.run("idea", "Try something", "--slug", "explore-thing", "--body", "details");
    expect(r.out).toContain("explore-thing queued");
    expect((await t.run("backlog")).out).toMatch(/explore-thing,idea/);
  });

  it("rejects bad kinds, including change", async () => {
    for (const k of ["change", "nope"]) {
      const r = await t.run("idea", "x thing", "--kind", k);
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("bad kind");
    }
  });

  it("rejects bad priority and bad slug", async () => {
    expect((await t.run("idea", "x thing", "--priority", "9")).out).toContain("bad priority");
    expect((await t.run("idea", "x thing", "--slug", "Bad Slug")).out).toContain("bad slug");
  });

  it("sorts by priority, unset last", async () => {
    await t.run("idea", "unset one");
    await t.run("idea", "low one", "--priority", "3");
    await t.run("idea", "high one", "--priority", "0");
    const out = (await t.run("backlog")).out;
    const order = ["high-one", "low-one", "unset-one"].map((s) => out.indexOf(s)) ;
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0]).toBeLessThan(order[1] as number);
    expect(order[1]).toBeLessThan(order[2] as number);
  });

  it("collides with an existing backlog item", async () => {
    await t.run("idea", "dark mode");
    const r = await t.run("idea", "dark mode");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("is taken");
    expect(r.out).toContain("--slug");
  });

  it("collides with an active plan", async () => {
    await t.run("new", "add-auth", "Add auth");
    const r = await t.run("idea", "add auth");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("active change");
  });

  it("collides with an archived plan", async () => {
    mkdirSync(join(t.dir, "specs/changes/archived/2024-01-02-add-auth"), { recursive: true });
    const r = await t.run("idea", "add auth");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("archived change");
  });

  it("collides with a done backlog item", async () => {
    await t.run("idea", "dark mode");
    const { runTasks } = await import("../src/tasks.js");
    runTasks(t.dir, ["done", "dark-mode", "--file", "backlog.md"]);
    const r = await t.run("idea", "dark mode");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("is taken");
  });

  it("hides planned (kind change) items and shows empty hint", async () => {
    expect((await t.run("backlog")).out).toContain("change-axi idea");
    await t.run("new", "add-auth", "Add auth");
    const out = (await t.run("backlog")).out;
    expect(out).not.toContain("add-auth");
  });
});
