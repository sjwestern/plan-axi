import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(() => {
  repo = tempRepo();
});
afterEach(() => repo.cleanup());

const configPath = (): string => join(repo.dir, ".plan-axi.toml");

describe("config", () => {
  it("shows the default layout when no config exists", async () => {
    const result = await repo.run("config");
    expect(result.code).toBe(0);
    expect(result.out).toContain('docs_dir: docs');
    expect(result.out).toContain("domain");
    expect(result.out).toContain("sources: default");
    expect(existsSync(configPath())).toBe(false);
  });

  it("updates layout keys and preserves comments and unrelated tables", async () => {
    writeFileSync(
      configPath(),
      '# keep this comment\n[apply]\nagent = "custom {prompt}" # keep this value\n\n[docs]\n# retain ignore\nignore = ["generated/"]\n',
    );
    const result = await repo.run(
      "config",
      "--sections",
      "guides,rfcs",
      "--adr",
      "rfcs",
      "--guide",
      'guides="How to use the product"',
      "--guide",
      'rfcs="Technical decisions"',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain("sources: repo");
    expect(result.out).toContain("docs-axi migrate");
    const written = readFileSync(configPath(), "utf8");
    expect(written).toContain("# keep this comment");
    expect(written).toContain('agent = "custom {prompt}" # keep this value');
    expect(written).toContain("# retain ignore");
    expect(written).toContain('ignore = ["generated/"]');
    await repo.run("init");
    const created = await repo.run("new", "guides", "Getting started", "--summary", "Product guide");
    expect(created.code).toBe(0);
    expect(existsSync(join(repo.dir, "docs/guides/getting-started.md"))).toBe(true);
  });

  it("refuses invalid layouts without writing", async () => {
    const result = await repo.run("config", "--sections", "guides,rfcs", "--adr", "missing");
    expect(result.code).toBe(2);
    expect(existsSync(configPath())).toBe(false);
  });

  it("lets init set sections and ADRs before scaffolding", async () => {
    const result = await repo.run(
      "init",
      "--sections",
      "guides,rfcs",
      "--adr",
      "rfcs",
      "--guide",
      'guides="User guides"',
      "--guide",
      'rfcs="Decision records"',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain("guides/");
    expect(result.out).toContain("rfcs/");
    expect(existsSync(join(repo.dir, "docs/guides"))).toBe(true);
    expect(existsSync(join(repo.dir, "docs/rfcs"))).toBe(true);
    expect(result.out).toContain("sources: repo");
  });
});
