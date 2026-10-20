import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";
import { parseSections } from "../src/sections.js";

let repo: ReturnType<typeof tempRepo>;
const read = (rel: string): string => readFileSync(join(repo.dir, "docs", rel), "utf8");
const BODY = [
  "# Billing",
  "",
  "## Why",
  "",
  "Old why.",
  "",
  "```",
  "## not a heading",
  "```",
  "",
  "## Rules",
  "",
  "Intro.",
  "",
  "### Notes",
  "",
  "rule note",
  "",
  "## Refunds",
  "",
  "### Notes",
  "",
  "refund note",
  "",
].join("\n");

beforeEach(async () => {
  repo = tempRepo();
  await repo.run("init");
  await repo.run("new", "domain", "Billing", "--summary", "Billing rules", "--body", BODY);
});
afterEach(() => repo.cleanup());

describe("section parsing", () => {
  it("ignores fenced headings and builds unique refs", () => {
    const s = parseSections(BODY);
    expect(s.map((x) => x.title)).toEqual(["Billing", "Why", "Rules", "Notes", "Refunds", "Notes"]);
    expect(s.map((x) => x.ref)).toEqual(["Billing", "Why", "Rules", "Rules/Notes", "Refunds", "Refunds/Notes"]);
  });
});

describe("sections / show --section", () => {
  it("lists sections with refs", async () => {
    const r = await repo.run("sections", "domain/billing");
    expect(r.out).toContain("Rules/Notes");
    expect(r.out).toContain("Refunds/Notes");
    expect(r.out).not.toContain("not a heading");
  });

  it("errors on ambiguous selector and lists choices", async () => {
    const r = await repo.run("show", "domain/billing", "--section", "Notes");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("Rules/Notes");
    expect(r.out).toContain("Refunds/Notes");
    expect((await repo.run("show", "domain/billing", "--section", "Notes#2")).out).toContain("refund note");
  });

  it("show returns own content by default, subsections with --tree", async () => {
    const own = (await repo.run("show", "domain/billing", "--section", "rules")).out;
    expect(own).toContain("Intro.");
    expect(own).not.toContain("rule note");
    expect(own).toContain("--tree");
    expect((await repo.run("show", "domain/billing", "--section", "Rules", "--tree")).out).toContain("rule note");
  });
});

describe("write / append", () => {
  it("replaces one section, leaves the rest byte-exact, never echoes body", async () => {
    const before = read("domain/billing.md");
    const r = await repo.run("write", "domain/billing", "--section", "Why", "--body", "New why.\nSecond line.");
    expect(r.out).toContain("replaced");
    expect(r.out).not.toContain("New why");
    const after = read("domain/billing.md");
    expect(after).toContain("## Why\n\nNew why.\nSecond line.\n\n## Rules");
    expect(after).not.toContain("Old why");
    expect(after.replace(/## Why[\s\S]*?(?=## Rules)/, "")).toBe(before.replace(/## Why[\s\S]*?(?=## Rules)/, ""));
  });

  it("is idempotent", async () => {
    await repo.run("write", "domain/billing", "--section", "Why", "--body", "Same.");
    expect((await repo.run("write", "domain/billing", "--section", "Why", "--body", "Same.")).out).toContain("no-op");
  });

  it("own mode keeps subsections, --tree replaces them", async () => {
    await repo.run("write", "domain/billing", "--section", "Rules", "--body", "Changed.");
    expect(read("domain/billing.md")).toContain("Changed.\n\n### Notes");
    await repo.run("write", "domain/billing", "--section", "Rules", "--tree", "--body", "Flat.");
    const t = read("domain/billing.md");
    expect(t).toContain("Flat.\n\n## Refunds");
    expect(t).not.toContain("rule note");
  });

  it("rejects bodies with same-or-higher headings", async () => {
    const r = await repo.run("write", "domain/billing", "--section", "Rules", "--body", "x\n## Other");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("level");
  });

  it("fails on missing section; --add creates it (nested and top-level)", async () => {
    expect((await repo.run("write", "domain/billing", "--section", "Risks", "--body", "r")).code).not.toBe(0);
    await repo.run("write", "domain/billing", "--section", "Risks", "--add", "--body", "r1");
    await repo.run("write", "domain/billing", "--section", "Rules/Edge", "--add", "--body", "e1");
    await repo.run("write", "domain/billing", "--section", "Mid", "--add", "--after", "Why", "--body", "m1");
    const t = read("domain/billing.md");
    expect(t.trimEnd().endsWith("## Risks\n\nr1")).toBe(true);
    expect(t).toContain("rule note\n\n### Edge\n\ne1\n\n## Refunds");
    expect(t).toContain("```\n\n## Mid\n\nm1\n\n## Rules");
  });

  it("appends to list sections", async () => {
    await repo.run("write", "domain/billing", "--section", "Why", "--body", "- a");
    await repo.run("append", "domain/billing", "--section", "Why", "--body", "- b");
    expect(read("domain/billing.md")).toContain("## Why\n\n- a\n- b\n\n## Rules");
  });

  it("keeps the index in sync and preserves CRLF", async () => {
    const { writeFileSync } = await import("node:fs");
    const p = join(repo.dir, "docs/domain/billing.md");
    writeFileSync(p, readFileSync(p, "utf8").replace(/\n/g, "\r\n"));
    await repo.run("write", "domain/billing", "--section", "Why", "--body", "crlf");
    const t = readFileSync(p, "utf8");
    expect(t).toContain("## Why\r\n\r\ncrlf\r\n\r\n## Rules");
    expect(t.replace(/\r\n/g, "")).not.toContain("\n");
  });
});

describe("adr section flags", () => {
  it("fills template sections in one call and keeps headings", async () => {
    await repo.run("adr", "add", "Pick X", "--summary", "why x", "--context", "ctx text", "--decision", "dec text");
    const t = read("decisions/0001-pick-x.md");
    expect(t).toContain("## Context\n\nctx text\n\n## Decision\n\ndec text\n\n## Consequences");
    const r = await repo.run("adr", "add", "Pick Y", "--summary", "y", "--body", "b", "--context", "c");
    expect(r.code).not.toBe(0);
  });
});
