import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(() => {
  repo = tempRepo();
});
afterEach(() => repo.cleanup());

describe("home dashboard", () => {
  it("keeps the no-folder state", async () => {
    const r = await repo.run();
    expect(r.out).toContain("no docs folder");
    expect(r.out).toContain("docs-axi init");
  });

  it("keeps the empty state", async () => {
    await repo.run("init");
    expect((await repo.run()).out).toContain("docs");
  });

  it("prints counts and adr statuses without doc rows", async () => {
    await repo.run("init");
    await repo.run("new", "domain", "Billing rules", "--summary", "Invoice rules");
    await repo.run("adr", "add", "First choice", "--summary", "one");
    await repo.run("adr", "add", "Second choice", "--summary", "two");
    const r = await repo.run();
    expect(r.out).toContain("counts");
    expect(r.out).toContain("adrs: 2 (2 proposed)");
    expect(r.out).toContain("docs-axi adr list");
    expect(r.out).not.toContain("billing-rules.md");
    expect(r.out).not.toContain("0001-first-choice");
  });
});
