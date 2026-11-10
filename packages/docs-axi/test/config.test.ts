import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { docsConfigProblems, loadConfig, loadRawConfig, matchesAny, parseToml } from "../src/config.js";
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

describe("docsConfigProblems", () => {
  let dir: string;
  let xdg: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "dcp-"));
    xdg = join(dir, "xdg");
    mkdirSync(join(xdg, "plan-axi"), { recursive: true });
    process.env["XDG_CONFIG_HOME"] = xdg;
  });
  afterEach(() => {
    delete process.env["XDG_CONFIG_HOME"];
    rmSync(dir, { recursive: true, force: true });
  });
  const repoFile = () => join(dir, ".plan-axi.toml");
  const userFile = () => join(xdg, "plan-axi", "config.toml");
  const repo = (t: string) => writeFileSync(repoFile(), t);
  const user = (t: string) => writeFileSync(userFile(), t);
  const msgs = () => docsConfigProblems(dir).map((p) => p.message);

  it("is empty for a valid or absent config", () => {
    expect(docsConfigProblems(dir)).toEqual([]);
    repo('[docs]\ndir = "d"\nsections = ["a", "decisions"]\nadr = "decisions"\n[docs.section.a]\nguide = "g"\n');
    expect(docsConfigProblems(dir)).toEqual([]);
  });
  it("docs.dir", () => {
    repo('[docs]\ndir = ""\n');
    expect(docsConfigProblems(dir)).toEqual([{ file: repoFile(), key: "docs.dir", message: "docs.dir must be a non-empty string" }]);
  });
  it("docs.sections shape, slug, reserved, duplicate", () => {
    repo("[docs]\nsections = []\n");
    expect(msgs()).toEqual(["docs.sections must be a non-empty array of names"]);
    repo('[docs]\nsections = ["Bad", "other", "x", "x"]\n[docs.section.Bad]\nguide = "g"\n[docs.section.x]\nguide = "g"\n');
    expect(msgs()).toEqual(expect.arrayContaining(['docs.sections: "Bad" is not a lowercase slug', 'docs.sections: "other" is reserved', 'docs.sections: duplicate section "x"']));
  });
  it("docs.section.<n>.guide key shape, type and membership", () => {
    repo('[docs]\nsections = ["a"]\n[docs.section.a]\nguide = "g"\nbogus = "x"\n[docs.section.zz]\nguide = "g"\n');
    expect(msgs()).toEqual(['unknown key docs.section.a.bogus (expected docs.section.<name>.guide)', 'docs.section.zz.guide: "zz" is not in docs.sections']);
    repo('[docs]\nsections = ["a"]\n[docs.section.a]\nguide = true\n');
    expect(msgs()).toContain("docs.section.a.guide must be a string");
  });
  it("docs.adr type and membership", () => {
    repo('[docs]\nadr = "nope"\n');
    expect(msgs()).toEqual(['docs.adr: "nope" is not in docs.sections']);
    repo("[docs]\nadr = true\n");
    expect(msgs()).toEqual(["docs.adr must be a section name or false"]);
  });
  it("section without a guide", () => {
    repo('[docs]\nsections = ["custom"]\n');
    expect(msgs()).toEqual(['section "custom" needs a guide: set docs.section.custom.guide']);
  });
  it("docs.ignore and docs.map.* must be arrays", () => {
    repo('[docs]\nignore = "x"\n[docs.map]\ndomain = "y"\n');
    expect(docsConfigProblems(dir)).toEqual([
      { file: repoFile(), key: "docs.ignore", message: "docs.ignore must be an array" },
      { file: repoFile(), key: "docs.map.domain", message: "docs.map.domain must be an array" },
    ]);
  });
  it("collects several problems at once", () => {
    repo('[docs]\ndir = ""\nadr = true\nignore = "x"\n');
    expect(docsConfigProblems(dir)).toHaveLength(3);
  });
  it("names the user vs repo file", () => {
    user('[docs]\ndir = ""\n');
    repo('[docs]\nadr = true\n');
    expect(docsConfigProblems(dir)).toEqual([
      { file: userFile(), key: "docs.dir", message: "docs.dir must be a non-empty string" },
      { file: repoFile(), key: "docs.adr", message: "docs.adr must be a section name or false" },
    ]);
  });
  it("reports a user-file problem even when the repo overrides the key", () => {
    user('[docs]\ndir = ""\n');
    repo('[docs]\ndir = "ok"\n');
    expect(docsConfigProblems(dir)).toEqual([{ file: userFile(), key: "docs.dir", message: "docs.dir must be a non-empty string" }]);
  });
  it("cross-file: repo adr may name a user-file section", () => {
    user('[docs]\nsections = ["a", "b"]\n[docs.section.a]\nguide = "g"\n[docs.section.b]\nguide = "g"\n');
    repo('[docs]\nadr = "b"\n');
    expect(docsConfigProblems(dir)).toEqual([]);
  });
  it("syntax errors become a problem for the file", () => {
    repo("[docs\n");
    const p = docsConfigProblems(dir);
    expect(p).toHaveLength(1);
    expect(p[0]?.file).toBe(repoFile());
  });
  it("loadConfig still throws the first error", () => {
    repo('[docs]\ndir = ""\nadr = true\n');
    expect(() => loadConfig(dir)).toThrow(/docs.dir must be a non-empty string/);
  });
});
