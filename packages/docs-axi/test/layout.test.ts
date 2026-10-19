import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { isAdrSection, sectionOf, type Ctx } from "../src/model.js";
import { tempRepo } from "./helpers.js";

describe("layout config", () => {
  let repo: ReturnType<typeof tempRepo>;
  const repoCfg = (t: string) => writeFileSync(join(repo.dir, ".plan-axi.toml"), t);
  beforeEach(() => {
    repo = tempRepo();
    process.env["XDG_CONFIG_HOME"] = join(repo.dir, "xdg");
  });
  afterEach(() => {
    delete process.env["XDG_CONFIG_HOME"];
    repo.cleanup();
  });

  it("no config gives the default layout", () => {
    const l = loadConfig(repo.dir).layout;
    expect(l.dir).toBe("docs");
    expect(l.adr).toBe("decisions");
    expect(l.sections.map((s) => [s.name, s.kind])).toEqual([
      ["domain", "doc"],
      ["architecture", "doc"],
      ["decisions", "adr"],
    ]);
    expect(l.sections[0]!.guide).toMatch(/what the system is for/);
  });

  it("custom sections, adr and guides resolve", () => {
    repoCfg(
      '[docs]\ndir = "documentation"\nsections = ["guides", "adrs", "domain"]\nadr = "adrs"\n' +
        '[docs.section.guides]\nguide = "how-tos"\n[docs.section.adrs]\nguide = "decision log"\n',
    );
    const l = loadConfig(repo.dir).layout;
    expect(l.dir).toBe("documentation");
    expect(l.adr).toBe("adrs");
    expect(l.sections.map((s) => [s.name, s.guide, s.kind])).toEqual([
      ["guides", "how-tos", "doc"],
      ["adrs", "decision log", "adr"],
      ["domain", expect.stringMatching(/what the system/), "doc"],
    ]);
  });

  it("adr = false and adr defaults off when decisions is not a section", () => {
    repoCfg('[docs]\nadr = false\n');
    expect(loadConfig(repo.dir).layout.adr).toBeUndefined();
    repoCfg('[docs]\nsections = ["a"]\n[docs.section.a]\nguide = "g"\n');
    const l = loadConfig(repo.dir).layout;
    expect(l.adr).toBeUndefined();
    expect(isAdrSection(l, "a")).toBe(false);
  });

  it.each([
    ['sections = ["x"]', /section "x" needs a guide/],
    ['sections = ["domain", "domain"]', /duplicate section "domain"/],
    ['sections = ["other"]', /"other" is reserved/],
    ['sections = ["Bad Name"]', /not a lowercase slug/],
    ['adr = "nope"', /docs.adr: "nope" is not in docs.sections/],
    ['sections = ["domain"]\nadr = "decisions"', /docs.adr: "decisions" is not in docs.sections/],
  ])("rejects %s", (body, re) => {
    repoCfg(`[docs]\n${body}\n`);
    expect(() => loadConfig(repo.dir)).toThrow(re);
    expect(() => loadConfig(repo.dir)).toThrow(/\.plan-axi\.toml/);
  });

  it("repo overrides user for layout; ignore unions", () => {
    mkdirSync(join(repo.dir, "xdg/plan-axi"), { recursive: true });
    writeFileSync(
      join(repo.dir, "xdg/plan-axi/config.toml"),
      '[docs]\ndir = "u"\nignore = ["u/"]\nsections = ["domain"]\nadr = false\n',
    );
    repoCfg('[docs]\ndir = "r"\nignore = ["r/"]\n');
    const c = loadConfig(repo.dir);
    expect(c.layout.dir).toBe("r");
    expect(c.layout.sections.map((s) => s.name)).toEqual(["domain"]);
    expect(c.ignore).toEqual(expect.arrayContaining(["u/", "r/"]));
  });

  it("accepts [docs.map.<custom>] and places files with the layout", () => {
    repoCfg(
      '[docs]\nsections = ["guides"]\n[docs.section.guides]\nguide = "g"\n[docs.map]\nguides = ["old/"]\n',
    );
    const config = loadConfig(repo.dir);
    const ctx: Ctx = { root: repo.dir, docsDir: join(repo.dir, "docs"), config };
    expect(sectionOf(ctx, "guides/a.md")).toEqual({ section: "guides", mapped: false });
    expect(sectionOf(ctx, "old/a.md")).toEqual({ section: "guides", mapped: true });
    expect(sectionOf(ctx, "domain/a.md").section).toBe("other");
  });
});
