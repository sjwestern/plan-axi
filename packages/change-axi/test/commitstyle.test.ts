import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitHeader, commitStyle } from "../src/commitstyle.js";
import { commit } from "../src/git.js";

let dir: string;
let xdg: string | undefined;
const cfg = (t: string): void => writeFileSync(join(dir, ".plan-axi.toml"), t);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-style-"));
  xdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = join(dir, "no-user-config");
});
afterEach(() => {
  if (xdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = xdg;
  rmSync(dir, { recursive: true, force: true });
});

describe("commitStyle", () => {
  it("defaults", () => {
    expect(commitStyle(dir)).toEqual({ type: "chore", planType: "docs", scope: "plan", trailer: "Change" });
  });

  it("overrides, including empty scope and trailer", () => {
    cfg('[commit]\ntype = "build"\nplan_type = "feat"\nscope = ""\ntrailer = ""\n');
    expect(commitStyle(dir)).toEqual({ type: "build", planType: "feat", scope: "", trailer: "" });
  });

  it.each([
    ['type = "Chore"', "commit.type"],
    ['type = ""', "commit.type"],
    ['plan_type = "a b"', "commit.plan_type"],
    ['scope = "A"', "commit.scope"],
    ['trailer = "no spaces"', "commit.trailer"],
  ])("rejects %s", (line, key) => {
    cfg(`[commit]\n${line}\n`);
    expect(() => commitStyle(dir)).toThrow(key);
  });

  it("formats headers", () => {
    expect(commitHeader("chore", "plan", "x")).toBe("chore(plan): x");
    expect(commitHeader("chore", "", "x")).toBe("chore: x");
  });

  it("shortens a long slug to keep the conventional header within 100 characters", () => {
    const slug = "long-slug-name-something-".repeat(5);
    const header = commitHeader("chore", "plan", `start ${slug}`, slug);
    expect(header).toHaveLength(100);
    expect(header).toMatch(/^chore\(plan\): start long-slug-name-something-.*\.\.\.$/);
    expect(header).not.toContain(slug);
  });

  it("truncates an overlong subject without a slug", () => {
    const header = commitHeader("chore", "plan", "x".repeat(200));
    expect(header).toHaveLength(100);
    expect(header.endsWith("...")).toBe(true);
  });

  it("commits without parens or trailer when configured", () => {
    cfg('[commit]\nscope = ""\ntrailer = ""\n');
    const g = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t");
    g("config", "user.name", "t");
    writeFileSync(join(dir, "a"), "x");
    g("add", "a");
    commit({ root: dir } as never, "start change", "demo");
    expect(g("log", "-1", "--format=%B")).toBe("chore: start change");
  });

  it("commits a shortened header and keeps the full slug in the trailer", () => {
    const g = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@t");
    g("config", "user.name", "t");
    const slug = "long-slug-name-something-".repeat(5);
    writeFileSync(join(dir, "a"), "x");
    g("add", "a");
    commit({ root: dir } as never, `start ${slug}`, slug);
    const [header, , trailer] = g("log", "-1", "--format=%B").split("\n");
    expect(header).toHaveLength(100);
    expect(trailer).toBe(`Change: ${slug}`);
  });
});
