import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(async () => {
  repo = tempRepo();
  process.env["TASKS_AXI_FILE"] = "";
  await repo.run("new", "demo", "Demo");
  await repo.run("step", "add", "demo", "First", "--owns", "src/a/");
  await repo.run("step", "add", "demo", "Second", "--owns", "src/b/", "--after", "01-first");
  await repo.run("write", "demo", "01", "--section", "Goal", "--body", "Do the first thing.");
});
afterEach(() => repo.cleanup());

describe("claim", () => {
  it("claims, repeats, refuses blocked/done, picks first ready", async () => {
    const blocked = await repo.run("claim", "demo", "02");
    expect(blocked.code).not.toBe(0);
    expect(blocked.out).toContain("blocked");

    const a = await repo.run("claim", "demo");
    expect(a.code).toBe(0);
    expect(a.out).toContain("01-first");
    expect(a.out).toContain("src/a/");
    expect(a.out).toContain("Do the first thing.");
    expect(a.out).toContain("already: false");

    const b = await repo.run("claim", "demo", "01-first");
    expect(b.out).toContain("already: true");

    expect((await repo.run("claim", "demo")).code).not.toBe(0);

    await repo.run("status", "demo");
    const { execFileSync } = await import("node:child_process");
    execFileSync("tasks-axi", ["done", "01-first", "--file", "specs/changes/active/demo/tasks.md"], { cwd: repo.dir });
    const d = await repo.run("claim", "demo", "01");
    expect(d.code).not.toBe(0);
    expect(d.out).toContain("done");
    const e = await repo.run("claim", "demo");
    expect(e.out).toContain("02-second");
  });
});
