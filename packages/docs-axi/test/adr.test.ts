import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(async () => {
  repo = tempRepo();
  await repo.run("init");
  await repo.run("new", "domain", "Cache notes", "--summary", "Cache in domain terms");
  await repo.run("adr", "add", "Use Redis cache", "--summary", "Cache with redis", "--decision", "We use Redis. " + "x".repeat(600));
  await repo.run("adr", "add", "Use Postgres queue", "--summary", "Queue in postgres", "--status", "accepted");
});
afterEach(() => repo.cleanup());

describe("adr subcommands", () => {
  it("bare prints counts and hints", async () => {
    const r = await repo.run("adr");
    expect(r.out).toContain("2 in decisions");
    expect(r.out).toContain("proposed: 1");
    expect(r.out).toContain("accepted: 1");
    expect(r.out).toContain("adr list");
  });

  it("list shows all, filters by status, and errors on bad status", async () => {
    const all = await repo.run("adr", "list");
    expect(all.out).toContain("number,title,status,summary");
    expect(all.out).toContain("Use Redis cache");
    expect(all.out).toContain("Use Postgres queue");
    expect(all.out).not.toContain("Cache notes");
    const acc = await repo.run("adr", "list", "--status", "accepted");
    expect(acc.out).toContain("Postgres");
    expect(acc.out).not.toContain("Redis");
    expect((await repo.run("adr", "list", "--status", "bogus")).code).not.toBe(0);
  });

  it("list --status with no match gives context", async () => {
    const r = await repo.run("adr", "list", "--status", "deprecated");
    expect(r.out).toContain("0 ADRs with status=deprecated (2 ADRs total)");
  });

  it("list --full truncates decision text", async () => {
    const r = await repo.run("adr", "list", "--full");
    expect(r.out).toContain("decision");
    expect(r.out).toContain("superseded-by");
    expect(r.out).toContain("truncated");
    expect(r.out).toContain("We use Redis.");
  });

  it("search is scoped to ADRs", async () => {
    const r = await repo.run("adr", "search", "cache");
    expect(r.out).toContain("Use Redis cache");
    expect(r.out).not.toContain("Cache notes");
    expect(r.out).toContain("1/1");
    expect((await repo.run("adr", "search", "cache", "queue", "--all")).out).toContain("0 ADR matches");
  });

  it("add creates a numbered ADR", async () => {
    const r = await repo.run("adr", "add", "Third", "--summary", "t");
    expect(r.out).toContain("decisions/0003-third.md");
  });

  it("old create form errors with a hint", async () => {
    const r = await repo.run("adr", "Some title", "--summary", "s");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("docs-axi adr add");
  });

  it("unknown flags error", async () => {
    expect((await repo.run("adr", "list", "--bogus")).code).not.toBe(0);
    expect((await repo.run("adr", "search", "x", "--bogus")).code).not.toBe(0);
  });
});
