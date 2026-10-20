import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main as docsMain } from "docs-axi/lib/cli";
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
const docs = async (...argv: string[]): Promise<string> => {
  let out = "";
  process.exitCode = undefined;
  await docsMain({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  process.exitCode = undefined;
  return out;
};

async function fill(slug: string): Promise<void> {
  await run("new", slug, `Title ${slug}`);
  await run("step", "add", slug, "Do it", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Risks and open questions", "Steps"]) {
    await run("write", slug, "proposal", "--section", s, "--body", "x");
  }
  await run("write", slug, "proposal", "--section", "Docs impact", "--body", "None - test");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", slug, "01", "--section", s, "--body", "x");
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-refs-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await docs("init");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("change refs", () => {
  it("where finds active, archived and backlog-only", async () => {
    await fill("alpha");
    mkdirSync(join(dir, "specs/changes/archived/2024-01-02-beta"), { recursive: true });
    execFileSync("tasks-axi", ["add", "gamma", "--title", "Gamma", "--file", "backlog.md"], { cwd: dir });
    expect((await run("where", "alpha")).out).toContain("state: active");
    const b = await run("where", "beta");
    expect(b.out).toContain("state: archived");
    expect(b.out).toContain("specs/changes/archived/2024-01-02-beta");
    expect((await run("where", "gamma")).out).toContain("state: backlog");
    expect((await run("where", "nope")).code).toBe(1);
  });

  it("show reads an archived change", async () => {
    const d = join(dir, "specs/changes/archived/2024-01-02-beta");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "proposal.md"), "# Beta\n\n## Why\n\nBecause.\n");
    const r = await run("show", "beta", "proposal");
    expect(r.out).toContain("Because.");
    expect(r.out).toContain("archived");
    expect((await run("write", "beta", "proposal", "--section", "Why", "--body", "x")).code).toBe(1);
  });

  it("check: unknown change ref errors, path warns", async () => {
    await fill("alpha");
    await run("append", "alpha", "proposal", "--section", "Why", "--body", "see change:ghost and specs/changes/archived/2024-01-02-beta/proposal.md and specs/changes/active/<slug>/");
    const r = await run("check", "alpha");
    expect(r.code).toBe(1);
    expect(r.out).toContain("UNKNOWN_CHANGE_REF");
    expect(r.out).toContain("change:ghost");
    expect(r.out).toContain("CHANGE_PATH_REF");
    expect(r.out).not.toContain("active/<slug>");
  });

  it("check: known change ref is fine", async () => {
    await fill("alpha");
    await fill("delta");
    await run("append", "alpha", "proposal", "--section", "Why", "--body", "after change:delta");
    const r = await run("check", "alpha");
    expect(r.out).not.toContain("UNKNOWN_CHANGE_REF");
  });

  it("archive reports old-path references without editing", async () => {
    await fill("alpha");
    execFileSync("tasks-axi", ["done", "01-do-it", "--file", "specs/changes/active/alpha/tasks.md"], { cwd: dir });
    writeFileSync(join(dir, "NOTES.md"), "see specs/changes/active/alpha/proposal.md\n");
    git("add", "-A");
    git("commit", "-q", "-m", "plan");
    git("checkout", "-q", "-b", "alpha");
    const dry = await run("archive", "alpha", "--dry-run");
    expect(dry.out).toContain("old_path_references");
    expect(dry.out).toContain("NOTES.md:1");
    const r = await run("archive", "alpha", "--commit");
    expect(r.out).toContain("NOTES.md:1");
    expect(readFileSync(join(dir, "NOTES.md"), "utf8")).toContain("specs/changes/active/alpha");
  });

  it("docs-axi warns on docs and ADRs linking changes, ignores placeholders", async () => {
    await docs("new", "architecture", "Arch", "--summary", "A");
    await docs("adr", "add", "Pick", "--summary", "pick", "--context", "see change:alpha", "--decision", "d", "--consequences", "e");
    const a = join(dir, "docs/architecture/arch.md");
    writeFileSync(a, readFileSync(a, "utf8") + "\nSee [plan](../../specs/changes/active/alpha/proposal.md). Also `specs/changes/active/<slug>/`.\n");
    await docs("index");
    const out = await docs("check");
    expect(out).toContain("DOC_LINKS_TO_CHANGE");
    expect(out).toContain("architecture/arch.md");
    expect(out).toContain("decisions/0001-pick.md");
    writeFileSync(a, readFileSync(a, "utf8").replace(/See \[plan\].*Also/, "Also"));
    const ok = await docs("check");
    expect(ok).not.toContain("architecture/arch.md");
  });
});
