import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const P = "demo-change";
const S = "01-do-it";
const put = (rel: string, text: string): void => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-docs-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("check step Docs header", () => {
  it("accepts none", async () => {
    await run("step", "set", P, S, "--docs", "none");
    expect((await run("check", P)).out).not.toMatch(/NO_DOCS|DOCS_MISSING|DOCS_NONE_MIXED/);
  });
  it("warns DOCS_MISSING for a nonexistent doc", async () => {
    await run("step", "set", P, S, "--docs", "docs/domain/nope.md");
    expect((await run("check", P)).out).toMatch(/DOCS_MISSING.*nope\.md/);
  });
  it("warns DOCS_NONE_MIXED", async () => {
    put("docs/domain/x.md", "---\ntitle: X\nsummary: x\n---\n# X\n");
    const f = join(dir, "specs/changes/active", P, `${S}.md`);
    writeFileSync(f, readFileSync(f, "utf8").replace(/^Docs:.*$/m, "Docs: none, docs/domain/x.md"));
    expect((await run("check", P)).out).toMatch(/DOCS_NONE_MIXED/);
  });
  it("skips repo-prefixed entries", async () => {
    await run("step", "set", P, S, "--docs", "api:docs/x.md");
    expect((await run("check", P)).out).not.toMatch(/DOCS_MISSING/);
  });
  it("warns DOCS_NO_FRONTMATTER for a doc without title and summary", async () => {
    put("docs/domain/bare.md", "# Bare\n");
    await run("step", "set", P, S, "--docs", "docs/domain/bare.md");
    expect((await run("check", P)).out).toMatch(/DOCS_NO_FRONTMATTER.*bare\.md/);
  });
  it("passes a doc with frontmatter", async () => {
    put("docs/domain/ok.md", "---\ntitle: Ok\nsummary: fine\n---\n# Ok\n");
    await run("step", "set", P, S, "--docs", "docs/domain/ok.md");
    expect((await run("check", P)).out).not.toMatch(/DOCS_/);
  });
});
