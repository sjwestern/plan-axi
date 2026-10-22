import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const docs = async (...argv: string[]): Promise<void> => {
  await docsMain({ argv, cwd: dir, stdout: { write: () => true } });
};
const tasks = (...a: string[]): string => execFileSync("tasks-axi", a, { cwd: dir, encoding: "utf8" });

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-arch-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await docs("init");
  await run("new", "demo-change", "Demo change");
  await run("step", "add", "demo-change", "Do it", "--owns", "src/");
  const P = "demo-change";
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", "x");
  }
  await run("write", P, "proposal", "--section", "Steps", "--body", "- `01-do-it.md` - it");
  await run("write", P, "proposal", "--section", "Docs impact", "--body", "- `docs/domain/thing.md` - new: thing\n- `docs/decisions/0001-pick.md` - new ADR");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01", "--section", s, "--body", "x");
  await docs("new", "domain", "Thing", "--summary", "A thing");
  await docs("adr", "add", "Pick", "--summary", "pick", "--context", "c", "--decision", "d", "--consequences", "e");
  writeFileSync(join(dir, ".gitignore"), "");
  git("add", "-A");
  git("commit", "-q", "-m", "plan");
  git("checkout", "-q", "-b", "demo-change");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("archive", () => {
  it("refuses with open tasks", async () => {
    const r = await run("archive", "demo-change");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("not done");
  });

  it("uses the configured docs directory and ADR section when archiving", async () => {
    writeFileSync(
      join(dir, ".plan-axi.toml"),
      '[docs]\ndir = "documentation"\nsections = ["guides", "rfcs"]\nadr = "rfcs"\n\n[docs.section.guides]\nguide = "guides"\n\n[docs.section.rfcs]\nguide = "decisions"\n',
    );
    rmSync(join(dir, "docs"), { recursive: true, force: true });
    await docs("init");
    await docs("new", "guides", "Thing", "--summary", "A thing");
    await docs("adr", "add", "Pick", "--summary", "pick", "--context", "c", "--decision", "d", "--consequences", "e");
    await run(
      "write",
      "demo-change",
      "proposal",
      "--section",
      "Docs impact",
      "--body",
      "- `documentation/guides/thing.md` - new: thing\n- `documentation/rfcs/0001-pick.md` - new ADR",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "configured docs layout");

    tasks("start", "01-do-it", "--file", "specs/changes/active/demo-change/tasks.md");
    tasks("done", "01-do-it", "--file", "specs/changes/active/demo-change/tasks.md");
    git("add", "-A");
    git("commit", "-q", "-m", "done");

    const r = await run("archive", "demo-change", "--commit");
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, "documentation/rfcs/0001-pick.md"), "utf8")).toContain("status: accepted");
    expect(readFileSync(join(dir, "documentation/README.md"), "utf8")).toContain("0001-pick");
    const committed = git("show", "--name-only", "--format=", "HEAD");
    expect(committed).toContain("documentation/README.md");
    expect(committed).toContain("documentation/rfcs/0001-pick.md");
    expect(committed).not.toContain("docs/");
    expect(git("status", "--porcelain")).toBe("");
  });

  it("refuses when a listed doc was not updated, passes after, accepts ADRs, moves, commits", async () => {
    tasks("start", "01-do-it", "--file", "specs/changes/active/demo-change/tasks.md");
    tasks("done", "01-do-it", "--file", "specs/changes/active/demo-change/tasks.md");
    git("add", "-A");
    git("commit", "-q", "-m", "done");
    const bad = await run("archive", "demo-change", "--dry-run");
    expect(bad.code).not.toBe(0);
    expect(bad.out).toContain("docs/domain/thing.md");

    await docs("write", "domain/thing", "--section", "Details", "--add", "--body", "real content");
    git("add", "-A");
    git("commit", "-q", "-m", "docs");
    const dry = await run("archive", "demo-change", "--dry-run");
    expect(dry.out).toContain("dry run");
    expect(dry.out).toContain("accept");
    expect(dry.out).toContain("change-axi finish demo-change");
    expect(existsSync(join(dir, "specs/changes/active/demo-change"))).toBe(true);

    const r = await run("archive", "demo-change", "--commit");
    expect(r.code).toBe(0);
    expect(r.out).toContain("archived");
    expect(existsSync(join(dir, "specs/changes/active/demo-change"))).toBe(false);
    const date = new Date().toLocaleDateString("sv-SE");
    expect(existsSync(join(dir, `specs/changes/archived/${date}-demo-change/proposal.md`))).toBe(true);
    expect(readFileSync(join(dir, "docs/decisions/0001-pick.md"), "utf8")).toContain("status: accepted");
    expect(git("status", "--porcelain")).toBe("");
    expect(git("log", "-1", "--format=%s")).toBe(`chore(plan): archive demo-change`);
    expect(git("log", "-1", "--format=%(trailers:key=Change,valueonly)").trim()).toBe("demo-change");
    expect(tasks("show", "demo-change", "--file", "backlog.md")).toContain("state: done");
    expect((await run("archive", "demo-change")).out).toContain("already archived");
  });
});
