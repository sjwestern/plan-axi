import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const adr = (file: string, title: string, extra = ""): void => {
  mkdirSync(join(dir, "docs/decisions"), { recursive: true });
  writeFileSync(join(dir, "docs/decisions", file), `---\ntitle: ${title}\nsummary: ${title} summary\ntags: [x]\nstatus: proposed\n---\n\n# ${title}\n\n${extra}\n`);
};
const plan = async (P: string): Promise<void> => {
  await run("new", P, "Demo");
  await run("step", "add", P, "First", "--owns", "src/");
  for (const s of ["Why", "Context", "What changes", "Out of scope", "Approach", "Acceptance", "Docs impact", "Risks and open questions"]) {
    await run("write", P, "proposal", "--section", s, "--body", "x");
  }
  await run("write", P, "proposal", "--section", "Steps", "--body", "- `01-first.md` - it");
  for (const s of ["Goal", "Context", "Work", "Done when"]) await run("write", P, "01", "--section", s, "--body", "x");
};
const commands = (out: string): string[] => out.split("\n").filter((l) => /docs-axi adr |git pull/.test(l));

let xdg: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-adrg-"));
  xdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = join(dir, "no-user-config");
  process.env["TASKS_AXI_FILE"] = "";
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "backlog.md"), "# b\n");
  adr("0001-first.md", "First");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});
afterEach(() => {
  if (xdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = xdg;
  rmSync(dir, { recursive: true, force: true });
});

describe("ADR guard on commit-plan", () => {
  it("blocks a duplicate number in the tree, then passes after renumber", async () => {
    await plan("demo");
    adr("0001-second.md", "Second");
    const r = await run("commit-plan", "demo");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("ADR_DUPLICATE_NUMBER");
    expect(commands(r.out).length).toBeLessThanOrEqual(2);
    expect(r.out).toContain("docs-axi adr renumber");
    execFileSync("rm", [join(dir, "docs/decisions/0001-second.md")]);
    adr("0002-second.md", "Second");
    const ok = await run("commit-plan", "demo");
    expect(ok.code).toBe(0);
  });
  it("blocks a number used on the default branch and names the branch-side file", async () => {
    git("switch", "-q", "-c", "feat");
    adr("0002-branch-side.md", "Branch side");
    git("add", "-A");
    git("commit", "-q", "-m", "branch adr");
    git("switch", "-q", "main");
    adr("0002-main-side.md", "Main side");
    git("add", "-A");
    git("commit", "-q", "-m", "main adr");
    git("switch", "-q", "feat");
    await plan("demo");
    const r = await run("commit-plan", "demo");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("ADR_NUMBER_TAKEN");
    expect(r.out).toContain("docs/decisions/0002-branch-side.md");
    expect(r.out).toContain("ADR-0002-branch-side");
    expect(commands(r.out).length).toBeLessThanOrEqual(2);
  });
  it("blocks a bare ref and names docs-axi adr fix-refs", async () => {
    await plan("demo");
    adr("0002-second.md", "Second", "See ADR 1 for context.");
    const r = await run("commit-plan", "demo");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("ADR_REF_BARE");
    expect(r.out).toContain("docs-axi adr fix-refs");
  });
});

describe("ADR guard on finish", () => {
  it("dry-run from the change branch blocks a duplicate number", async () => {
    await plan("demo");
    git("add", "-A");
    git("commit", "-q", "-m", "plan");
    git("switch", "-q", "-c", "demo");
    adr("0001-second.md", "Second");
    git("add", "-A");
    git("commit", "-q", "-m", "dup");
    const r = await run("finish", "demo", "--dry-run");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("ADR_DUPLICATE_NUMBER");
  });
});

describe("ADR refs to a source repo", () => {
  let code: string;
  const cite = async (text: string): Promise<void> => {
    await run("write", "demo", "proposal", "--section", "Context", "--body", text);
  };
  beforeEach(() => {
    code = mkdtempSync(join(tmpdir(), "change-axi-adrsrc-"));
    mkdirSync(join(code, "docs/decisions"), { recursive: true });
    writeFileSync(join(code, "docs/decisions/0009-legacy-first.md"), "---\ntitle: Legacy first\nsummary: s\ntags: [x]\nstatus: accepted\n---\n\n# Legacy first\n");
    writeFileSync(join(dir, ".plan-axi.toml"), `[repos.app]\npath = "${code}"\ndocs = "docs"\n`);
  });
  afterEach(() => rmSync(code, { recursive: true, force: true }));

  it("check accepts plain and qualified refs to an ADR that only the source repo has", async () => {
    await plan("demo");
    await cite("See ADR-0009-legacy-first and app:ADR-0009-legacy-first.");
    const r = await run("check", "demo");
    expect(r.out).not.toContain("ADR_REF");
    expect(r.code).toBe(0);
  });
  it("check still rejects a wrong slug and an unknown repo qualifier", async () => {
    await plan("demo");
    await cite("See ADR-0009-wrong-slug and nope:ADR-0009-legacy-first.");
    const r = await run("check", "demo");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("ADR_REF_UNKNOWN");
    expect(r.out).toContain("ADR-0009-legacy-first");
  });
  it("commit-plan guard resolves refs against the source repo", async () => {
    await plan("demo");
    await cite("See ADR-0009-legacy-first.");
    const r = await run("commit-plan", "demo");
    expect(r.out).not.toContain("ADR_REF_UNKNOWN");
  });
  it("warns and skips a source repo that is not readable", async () => {
    rmSync(join(code, "docs"), { recursive: true, force: true });
    await plan("demo");
    await cite("See ADR-0009-legacy-first.");
    const r = await run("check", "demo");
    expect(r.out).toContain("ADR_SOURCE_UNAVAILABLE");
    expect(r.out).toContain("ADR_REF_UNKNOWN");
  });
});
