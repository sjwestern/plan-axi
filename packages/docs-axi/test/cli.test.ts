import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(() => {
  repo = tempRepo();
});
afterEach(() => repo.cleanup());

const read = (rel: string): string => readFileSync(join(repo.dir, "docs", rel), "utf8");

describe("init / home", () => {
  it("home points at init when there is no docs folder", async () => {
    const r = await repo.run();
    expect(r.out).toContain("no docs folder");
    expect(r.out).toContain("docs-axi init");
  });

  it("init is idempotent", async () => {
    expect((await repo.run("init")).out).toContain("created 4 item(s)");
    expect((await repo.run("init")).out).toContain("no-op");
    expect(read("README.md")).toContain("docs-axi:index:start");
  });
});

describe("new / adr / update / supersede", () => {
  beforeEach(async () => {
    await repo.run("init");
  });

  it("creates docs, numbers ADRs, and keeps the index in sync", async () => {
    await repo.run("new", "domain", "Billing rules", "--summary", "Invoice rules", "--tags", "billing");
    await repo.run("adr", "add", "First choice", "--summary", "one");
    await repo.run("adr", "add", "Second choice", "--summary", "two");
    expect(read("domain/billing-rules.md")).toContain("tags: [billing]");
    expect(read("decisions/0002-second-choice.md")).toContain("status: proposed");
    const idx = read("README.md");
    expect(idx).toContain("[Billing rules](domain/billing-rules.md) - Invoice rules");
    expect(idx).toContain("[0002 Second choice](decisions/0002-second-choice.md) - two (proposed)");
    expect((await repo.run("check")).code).toBe(0);
  });

  it("requires --summary and rejects bad slugs, tags, sections", async () => {
    expect((await repo.run("new", "domain", "X")).out).toContain("--summary is required");
    expect((await repo.run("new", "domain", "X", "--summary", "s", "--slug", "Bad Slug")).code).toBe(2);
    expect((await repo.run("new", "domain", "X", "--summary", "s", "--tags", "Bad Tag")).code).toBe(2);
    expect((await repo.run("new", "nope", "X", "--summary", "s")).code).toBe(2);
  });

  it("creating the same doc twice is a no-op", async () => {
    await repo.run("new", "domain", "Same", "--summary", "s");
    const r = await repo.run("new", "domain", "Same", "--summary", "s");
    expect(r.out).toContain("already exists");
    expect(r.code).toBe(0);
  });

  it("update is idempotent and rejects empty updates", async () => {
    await repo.run("adr", "add", "Pick", "--summary", "s");
    expect((await repo.run("update", "1", "--status", "accepted")).out).toContain("updated");
    expect((await repo.run("update", "1", "--status", "accepted")).out).toContain("no-op");
    expect((await repo.run("update", "1")).code).toBe(2);
    expect((await repo.run("update", "1", "--status", "bogus")).code).toBe(2);
  });

  it("supersede links both ADRs and check passes", async () => {
    await repo.run("adr", "add", "Old", "--summary", "o");
    await repo.run("adr", "add", "New", "--summary", "n");
    await repo.run("supersede", "1", "--by", "2");
    expect(read("decisions/0001-old.md")).toContain("status: superseded");
    expect(read("decisions/0001-old.md")).toContain('superseded-by: "0002"');
    expect(read("decisions/0002-new.md")).toContain('supersedes: "0001"');
    expect((await repo.run("check")).code).toBe(0);
    expect((await repo.run("supersede", "1", "--by", "2")).out).toContain("no-op");
  });

  it("rejects unknown flags with the valid list", async () => {
    const r = await repo.run("list", "--stat", "x");
    expect(r.code).toBe(2);
    expect(r.out).toContain("unknown flag --stat");
    expect(r.out).toContain("--status");
  });
});

describe("configured layout commands", () => {
  it("uses configured sections and ADR rules across init, docs, index, home and check", async () => {
    writeFileSync(
      join(repo.dir, ".plan-axi.toml"),
      '[docs]\nsections = ["guides", "reference", "rfcs"]\nadr = "rfcs"\n' +
        '[docs.section.guides]\nguide = "how to use the product"\n' +
        '[docs.section.reference]\nguide = "API and reference material"\n' +
        '[docs.section.rfcs]\nguide = "technical decisions"\n',
    );
    const init = await repo.run("init");
    expect(init.out).toContain("guides/");
    expect(init.out).toContain("reference/");
    expect(init.out).toContain("rfcs/");
    expect(read("README.md")).toContain("- `guides/` - how to use the product");
    expect(read("README.md")).toContain("## Guides");
    expect(read("README.md")).toContain("## Reference");
    expect(read("README.md")).toContain("## Rfcs");

    const badSection = await repo.run("new", "unknown", "Bad", "--summary", "bad");
    expect(badSection.code).toBe(2);
    expect(badSection.out).toContain("guides - how to use the product");
    expect(badSection.out).toContain("rfcs - technical decisions");

    await repo.run("new", "guides", "Getting started", "--summary", "Product guide");
    await repo.run("new", "reference", "API", "--summary", "API reference");
    await repo.run("adr", "add", "First decision", "--summary", "first");
    await repo.run("adr", "add", "Second decision", "--summary", "second");
    expect(read("rfcs/0002-second-decision.md")).toContain("status: proposed");
    expect((await repo.run("list", "guides")).out).toContain("guides/getting-started.md");
    expect((await repo.run("search", "product", "--section", "guides")).out).toContain("guides/getting-started.md");
    await repo.run("update", "1", "--status", "accepted");
    await repo.run("supersede", "1", "--by", "2");
    expect(read("rfcs/0001-first-decision.md")).toContain("status: superseded");

    mkdirSync(join(repo.dir, "docs/misc"), { recursive: true });
    writeFileSync(join(repo.dir, "docs/misc/legacy.md"), "# Legacy\n");
    await repo.run("index");
    const home = await repo.run();
    expect(home.out).toContain("sections");
    expect(home.out).toContain("guides: how to use the product");
    expect(home.out).not.toContain("domain:");
    const check = await repo.run("check");
    expect(check.code).toBe(0);
    expect(check.out).toContain("UNMANAGED");
  });

  it("requires a configured ADR section for ADR commands", async () => {
    writeFileSync(
      join(repo.dir, ".plan-axi.toml"),
      '[docs]\nsections = ["guides", "reference"]\nadr = false\n' +
        '[docs.section.guides]\nguide = "how to use the product"\n' +
        '[docs.section.reference]\nguide = "API and reference material"\n',
    );
    await repo.run("init");
    await repo.run("new", "guides", "Guide", "--summary", "s");
    for (const args of [
      ["adr", "No ADR", "--summary", "s"],
      ["update", "guides/guide", "--status", "accepted"],
      ["supersede", "1", "--by", "2"],
    ]) {
      const result = await repo.run(...args);
      expect(result.code).toBe(2);
      expect(result.out).toContain("enable ADR commands");
    }
  });
});

describe("list / search / show", () => {
  beforeEach(async () => {
    await repo.run("init");
    await repo.run("new", "domain", "Billing rules", "--summary", "Invoice and refund rules", "--tags", "billing");
    await repo.run("new", "architecture", "Job queue", "--summary", "Background job scheduling");
  });

  it("list filters by section and tag", async () => {
    expect((await repo.run("list", "domain")).out).toContain("billing-rules.md");
    expect((await repo.run("list", "domain")).out).not.toContain("job-queue");
    expect((await repo.run("list", "--tag", "billing")).out).toContain("count: 1 of 1");
    expect((await repo.run("list", "--tag", "nope")).out).toContain("0 docs match");
  });

  it("search ranks and reports empty results definitively", async () => {
    const hit = await repo.run("search", "billing");
    expect(hit.out).toContain("domain/billing-rules.md");
    expect(hit.out).not.toContain("job-queue");
    expect((await repo.run("search", "zzzz")).out).toContain('0 matches for: zzzz');
  });

  it("show truncates long bodies and accepts several path forms", async () => {
    writeFileSync(
      join(repo.dir, "docs/domain/billing-rules.md"),
      `---\ntitle: Billing rules\nsummary: s\n---\n\n${"word ".repeat(600)}\n`,
    );
    const r = await repo.run("show", "docs/domain/billing-rules.md");
    expect(r.out).toContain("truncated");
    expect(r.out).toContain("show domain/billing-rules.md --full");
    expect((await repo.run("show", "domain/billing-rules", "--full")).out).not.toContain("truncated");
    expect((await repo.run("show", "domain/missing")).code).toBe(1);
  });
});

describe("check", () => {
  beforeEach(async () => {
    await repo.run("init");
  });

  it("finds missing frontmatter, broken links, stale index", async () => {
    writeFileSync(join(repo.dir, "docs/domain/bare.md"), "# no frontmatter\n[x](./gone.md)\n");
    writeFileSync(join(repo.dir, "docs/stray.md"), "x\n");
    const r = await repo.run("check");
    expect(r.code).toBe(1);
    for (const code of ["NO_FRONTMATTER", "BROKEN_LINK", "INDEX_STALE"]) {
      expect(r.out).toContain(code);
    }
  });

  it("ignores links in code blocks and external links", async () => {
    await repo.run("new", "domain", "Links", "--summary", "s");
    writeFileSync(
      join(repo.dir, "docs/domain/links.md"),
      "---\ntitle: Links\nsummary: s\n---\n\n```\n[x](./nope.md)\n```\n[web](https://example.com) [a](#anchor)\n",
    );
    await repo.run("index");
    expect((await repo.run("check")).code).toBe(0);
  });

  it("detects duplicate ADR numbers (two branches picked the same one)", async () => {
    await repo.run("adr", "add", "One", "--summary", "s");
    mkdirSync(join(repo.dir, "docs/decisions"), { recursive: true });
    writeFileSync(
      join(repo.dir, "docs/decisions/0001-other.md"),
      "---\ntitle: Other\nsummary: s\nstatus: proposed\n---\n",
    );
    const r = await repo.run("check");
    expect(r.code).toBe(1);
    expect(r.out).toContain("ADR_DUPLICATE_NUMBER");
  });

  it("index regeneration is idempotent and byte-stable", async () => {
    await repo.run("new", "domain", "B", "--summary", "b");
    await repo.run("new", "domain", "A", "--summary", "a");
    const first = read("README.md");
    expect((await repo.run("index")).out).toContain("no-op");
    expect(read("README.md")).toBe(first);
    expect(first.indexOf("domain/a.md")).toBeLessThan(first.indexOf("domain/b.md"));
  });

  it("preserves hand-written README content outside the markers", async () => {
    const p = join(repo.dir, "docs/README.md");
    writeFileSync(p, `${readFileSync(p, "utf8")}\n## Notes\n\nkeep me\n`);
    await repo.run("new", "domain", "C", "--summary", "c");
    expect(readFileSync(p, "utf8")).toContain("keep me");
  });
});
