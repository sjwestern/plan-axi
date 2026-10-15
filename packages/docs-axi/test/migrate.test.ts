import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveTitleSummary } from "../src/derive.js";
import { tempRepo } from "./helpers.js";

describe("deriveTitleSummary", () => {
  it("takes H1 and first sentence of first paragraph", () => {
    const r = deriveTitleSummary("# My *Doc*\n\n> note\n\nThis explains things. And more.\n", "x");
    expect(r.title).toBe("My Doc");
    expect(r.summary).toBe("This explains things.");
    expect(r.needsSummary).toBe(false);
  });
  it("falls back to title", () => {
    const r = deriveTitleSummary("# Only\n- a\n", "only");
    expect(r.summary).toBe("Only");
    expect(r.needsSummary).toBe(true);
  });
});

describe("migrate", () => {
  let repo: ReturnType<typeof tempRepo>;
  const w = (rel: string, t: string): void => {
    mkdirSync(join(repo.dir, "docs", rel, ".."), { recursive: true });
    writeFileSync(join(repo.dir, "docs", rel), t);
  };
  const r = (rel: string): string => readFileSync(join(repo.dir, "docs", rel), "utf8");
  beforeEach(() => {
    repo = tempRepo();
    w("billing.md", "# Billing\n\nMonthly invoices.\n\n[a](./architecture-notes/auth.md) `[c](./nope.md)`\n");
    w("architecture-notes/auth.md", "# Auth\n\nAuth text.\n\n[b](../billing.md)\n");
    w("standards/coding.md", "# Coding\n\nCode rules.\n");
    w("todo/t.md", "# T\n[b](../billing.md)\n");
    writeFileSync(join(repo.dir, "AGENTS.md"), "read docs/billing.md\n");
  });
  afterEach(() => repo.cleanup());

  it("dry run changes nothing", async () => {
    const o = await repo.run("migrate");
    expect(o.out).toContain("domain/billing.md");
    expect(o.out).toContain('docs] ignore = [\\"todo/\\"]');
    expect(existsSync(join(repo.dir, "docs/billing.md"))).toBe(true);
  });

  it("applies: moves, frontmatter, links, index, reports external refs", async () => {
    const o = await repo.run("migrate", "--apply");
    expect(o.code).toBe(0);
    expect(existsSync(join(repo.dir, "docs/billing.md"))).toBe(false);
    expect(r("domain/billing.md")).toContain("summary: Monthly invoices.");
    expect(r("domain/billing.md")).toContain("](../architecture/architecture-notes/auth.md)");
    expect(r("domain/billing.md")).toContain("`[c](./nope.md)`");
    expect(r("architecture/architecture-notes/auth.md")).toContain("](../../domain/billing.md)");
    expect(r("todo/t.md")).toContain("](../domain/billing.md)");
    expect(r("README.md")).toContain("domain/billing.md");
    expect(existsSync(join(repo.dir, "docs/standards/coding.md"))).toBe(true);
    expect(r("standards/coding.md")).toContain("summary: Code rules.");
    expect(r("README.md")).toContain("## Other");
    expect(r("README.md")).toContain("(standards/coding.md)");
    expect(o.out).toContain("AGENTS.md");
    const again = await repo.run("migrate", "--apply");
    expect(again.out).toContain("0 doc(s)");
  });

  it("a dry run never overwrites an existing plan file; --force regenerates", async () => {
    const plan = join(repo.dir, "plan.json");
    await repo.run("migrate", "--plan", plan);
    const entries = JSON.parse(readFileSync(plan, "utf8")) as { from: string; summary: string }[];
    entries.find((e) => e.from === "billing.md")!.summary = "Hand edited";
    writeFileSync(plan, JSON.stringify(entries));
    const o = await repo.run("migrate", "--plan", plan);
    expect(o.out).toContain("not modified");
    expect(readFileSync(plan, "utf8")).toContain("Hand edited");
    await repo.run("migrate", "--plan", plan, "--force");
    expect(readFileSync(plan, "utf8")).not.toContain("Hand edited");
  });

  it("applies an edited plan and validates it", async () => {
    const plan = join(repo.dir, "plan.json");
    await repo.run("migrate", "--plan", plan);
    const entries = JSON.parse(readFileSync(plan, "utf8")) as { from: string; to: string; section: string; summary: string }[];
    const b = entries.find((e) => e.from === "billing.md")!;
    b.section = "architecture";
    b.to = "architecture/billing.md";
    b.summary = "Edited summary";
    writeFileSync(plan, JSON.stringify(entries));
    const ok = await repo.run("migrate", "--apply", "--plan", plan);
    expect(ok.code).toBe(0);
    expect(r("architecture/billing.md")).toContain("summary: Edited summary");

    repo.cleanup();
    repo = tempRepo();
    w("a.md", "# A\n");
    writeFileSync(join(repo.dir, "p.json"), JSON.stringify([{ from: "a.md", action: "move", section: "domain", to: "domain/Bad Name.md", title: "A", summary: "s" }]));
    const bad = await repo.run("migrate", "--apply", "--plan", join(repo.dir, "p.json"));
    expect(bad.code).not.toBe(0);
    expect(existsSync(join(repo.dir, "docs/a.md"))).toBe(true);
  });
});

describe("weak summaries", () => {
  let repo: ReturnType<typeof tempRepo>;
  const w = (rel: string, t: string): void => {
    mkdirSync(join(repo.dir, "docs", rel, ".."), { recursive: true });
    writeFileSync(join(repo.dir, "docs", rel), t);
  };
  beforeEach(() => {
    repo = tempRepo();
    for (const n of ["a", "b", "c"]) w(`legacy/${n}.md`, `# Thing ${n}\n\nSpecification for the legacy team.\n`);
    w("status.md", "# Status doc\n\nStatus: planned, docs only.\n");
    w("good.md", "# Good\n\nExplains the billing cycle and when invoices are raised.\n");
  });
  afterEach(() => repo.cleanup());

  it("dry run flags them; apply refuses and changes nothing; override works", async () => {
    const d = await repo.run("migrate");
    expect(d.out).toContain("weak summary");
    expect(d.out).toContain("lead-in");
    const a = await repo.run("migrate", "--apply");
    expect(a.code).not.toBe(0);
    expect(a.out).toContain("legacy/a.md");
    expect(existsSync(join(repo.dir, "docs/good.md"))).toBe(true);
    const ok = await repo.run("migrate", "--apply", "--allow-weak-summaries");
    expect(ok.code).toBe(0);
    expect(existsSync(join(repo.dir, "docs/domain/good.md"))).toBe(true);
  });

  it("a rewritten plan passes", async () => {
    const plan = join(repo.dir, "p.json");
    await repo.run("migrate", "--plan", plan);
    const es = JSON.parse(readFileSync(plan, "utf8")) as { from: string; summary: string }[];
    for (const e of es) if (e.from !== "good.md") e.summary = `Real description of ${e.from} and when to read it`;
    writeFileSync(plan, JSON.stringify(es));
    expect((await repo.run("migrate", "--apply", "--plan", plan)).code).toBe(0);
  });
});
