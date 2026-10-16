import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRawConfig, matchesAny, parseToml } from "../src/config.js";
import { tempRepo } from "./helpers.js";

describe("toml subset", () => {
  it("parses tables, arrays, comments, multi-line arrays", () => {
    const kv = parseToml('# c\n[docs]\nignore = ["a/", "b" ] # x\n[docs.map]\ndomain = [\n  "x.md",\n  "y/",\n]\n', "t");
    expect(kv["docs.ignore"]).toEqual(["a/", "b"]);
    expect(kv["docs.map.domain"]).toEqual(["x.md", "y/"]);
  });
  it("globs", () => {
    expect(matchesAny(["todo/"], "todo/a.md")).toBe(true);
    expect(matchesAny(["todo/"], "todos/a.md")).toBe(false);
    expect(matchesAny(["**/*.draft.md"], "a/b/c.draft.md")).toBe(true);
    expect(matchesAny(["*.draft.md"], "a/c.draft.md")).toBe(false);
  });
});

describe("config", () => {
  let repo: ReturnType<typeof tempRepo>;
  beforeEach(async () => {
    repo = tempRepo();
    process.env["XDG_CONFIG_HOME"] = join(repo.dir, "xdg");
    await repo.run("init");
    mkdirSync(join(repo.dir, "docs/todo"), { recursive: true });
    writeFileSync(join(repo.dir, "docs/todo/a.md"), "x\n");
    writeFileSync(join(repo.dir, "docs/legacy.md"), "# L\n");
    writeFileSync(join(repo.dir, "docs/stray.md"), "x\n");
  });
  afterEach(() => {
    delete process.env["XDG_CONFIG_HOME"];
    repo.cleanup();
  });

  it("docs outside the layout are indexed in place under Other, no warnings", async () => {
    writeFileSync(join(repo.dir, "docs/legacy.md"), "# Legacy thing\n\nWhat it does. More.\n");
    await repo.run("index");
    const r = await repo.run("check");
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("warning");
    const idx = readFileSync(join(repo.dir, "docs/README.md"), "utf8");
    expect(idx).toContain("## Other");
    expect(idx).toContain("[Legacy thing](legacy.md) - What it does.");
    expect((await repo.run("list", "other")).out).toContain("legacy.md");
  });

  it("reports dead links in Other docs as warnings (exit 0)", async () => {
    writeFileSync(join(repo.dir, "docs/legacy.md"), "# L\n\nSee [gone](./gone.md).\n");
    await repo.run("index");
    const r = await repo.run("check");
    expect(r.code).toBe(0);
    expect(r.out).toContain("BROKEN_LINK");
    expect(r.out).toContain("warning");
  });

  it("repo ignore + user ignore + map", async () => {
    writeFileSync(join(repo.dir, ".plan-axi.toml"), '[docs]\nignore = ["todo/"]\n[docs.map]\ndomain = ["legacy.md"]\n');
    mkdirSync(join(repo.dir, "xdg/plan-axi"), { recursive: true });
    writeFileSync(join(repo.dir, "xdg/plan-axi/config.toml"), '[docs]\nignore = ["stray.md"]\n');
    await repo.run("index");
    const r = await repo.run("check");
    expect(r.code).toBe(0);
    expect(r.out).toContain("NO_FRONTMATTER");
    expect(readFileSync(join(repo.dir, "docs/README.md"), "utf8")).not.toContain("todo/a.md");
    expect(r.out).toContain("config: user+repo");
    const l = await repo.run("list", "domain");
    expect(l.out).toContain("legacy.md");
  });

  it("never touches default-ignored tool dirs", async () => {
    mkdirSync(join(repo.dir, "docs/node_modules/x"), { recursive: true });
    writeFileSync(join(repo.dir, "docs/node_modules/x/r.md"), "x\n");
    const r = await repo.run("check");
    expect(r.out).not.toContain("node_modules");
  });
});

describe("raw config", () => {
  it("merges user and repo: repo scalars win, arrays union", () => {
    const repo = tempRepo();
    const xdg = join(repo.dir, "xdg");
    process.env["XDG_CONFIG_HOME"] = xdg;
    try {
      mkdirSync(join(xdg, "plan-axi"), { recursive: true });
      writeFileSync(join(xdg, "plan-axi/config.toml"), '[apply]\nagent = "user {prompt}"\n[docs]\nignore = ["a/"]\n');
      expect(loadRawConfig(repo.dir)["apply.agent"]).toBe("user {prompt}");
      writeFileSync(join(repo.dir, ".plan-axi.toml"), '[apply]\nagent = "repo {prompt}"\n[docs]\nignore = ["b/"]\n');
      const cfg = loadRawConfig(repo.dir);
      expect(cfg["apply.agent"]).toBe("repo {prompt}");
      expect(cfg["docs.ignore"]).toEqual(["a/", "b/"]);
    } finally {
      delete process.env["XDG_CONFIG_HOME"];
      repo.cleanup();
    }
  });
});
