import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
const git = (...a: string[]): string =>
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: repo.dir, encoding: "utf8" });
const read = (p: string): string => readFileSync(join(repo.dir, p), "utf8");
const write = (p: string, t: string): void => {
  mkdirSync(join(repo.dir, p, ".."), { recursive: true });
  writeFileSync(join(repo.dir, p), t);
};
const adr = (n: string, slug: string): string =>
  `---\ntitle: ${slug}\nsummary: s\nstatus: proposed\n---\n\n# ${slug}\n`;

beforeEach(async () => {
  repo = tempRepo();
  await repo.run("init");
  write("docs/decisions/0012-alpha.md", adr("12", "alpha"));
  write("docs/decisions/0012-beta.md", adr("12", "beta"));
  write("docs/domain/notes.md", "---\ntitle: Notes\nsummary: n\n---\nSee ADR-0012-alpha and ADR-0012-beta, also ADR-0012-alpha-two.\n");
  write("specs/changes/archived/2024-01-01-old/proposal.md", "Uses ADR-0012-beta here.\n");
  write("specs/changes/active/x/proposal.md", "Uses ADR-0012-beta.\n");
  await repo.run("index");
});
afterEach(() => repo.cleanup());

describe("adr renumber", () => {
  it("renumbers one of two clashing ADRs and fixes refs everywhere", async () => {
    const r = await repo.run("adr", "renumber", "ADR-0012-beta");
    expect(r.code).toBe(0);
    expect(r.out).toContain("ADR-0012-beta -> ADR-0013-beta");
    expect(existsSync(join(repo.dir, "docs/decisions/0013-beta.md"))).toBe(true);
    expect(existsSync(join(repo.dir, "docs/decisions/0012-beta.md"))).toBe(false);
    const notes = read("docs/domain/notes.md");
    expect(notes).toContain("ADR-0012-alpha and ADR-0013-beta");
    expect(notes).toContain("ADR-0012-alpha-two");
    expect(read("specs/changes/archived/2024-01-01-old/proposal.md")).toContain("ADR-0013-beta");
    expect(read("specs/changes/active/x/proposal.md")).toContain("ADR-0013-beta");
    expect(read("docs/README.md")).toContain("0013-beta");
    expect((await repo.run("check")).out).not.toContain("beta");
  });

  it("accepts a path and is a no-op on rerun", async () => {
    await repo.run("adr", "renumber", "decisions/0012-beta.md");
    const again = await repo.run("adr", "renumber", "ADR-0012-beta");
    expect(again.code).toBe(0);
    expect(again.out).toContain("no-op");
  });

  it("skips numbers on the default branch and origin/<default>", async () => {
    git("init", "-q", "-b", "main");
    write("docs/decisions/0015-gamma.md", adr("15", "gamma"));
    git("add", "-A");
    git("commit", "-q", "-m", "x");
    execFileSync("rm", [join(repo.dir, "docs/decisions/0015-gamma.md")]); // held only by local main
    const r = await repo.run("adr", "renumber", "ADR-0012-beta");
    expect(r.out).toContain("ADR-0016-beta");
  });

  it("origin-only number is skipped", async () => {
    git("init", "-q", "-b", "main");
    write("docs/decisions/0020-delta.md", adr("20", "delta"));
    git("add", "-A");
    git("commit", "-q", "-m", "x");
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD").trim());
    // remove from local main so only origin/main holds it
    git("rm", "-q", "-f", "docs/decisions/0020-delta.md");
    git("commit", "-q", "-m", "rm");
    const r = await repo.run("adr", "renumber", "ADR-0012-beta");
    expect(r.out).toContain("ADR-0021-beta");
  });

  it("--to taken errors; --to free is allowed", async () => {
    const bad = await repo.run("adr", "renumber", "ADR-0012-beta", "--to", "12");
    expect(bad.code).toBe(0); // same number: no-op
    write("docs/decisions/0007-seven.md", adr("7", "seven"));
    const taken = await repo.run("adr", "renumber", "ADR-0012-beta", "--to", "7");
    expect(taken.code).toBe(1);
    expect(taken.out).toContain("already used");
    const free = await repo.run("adr", "renumber", "ADR-0012-beta", "--to", "40");
    expect(free.code).toBe(0);
    expect(existsSync(join(repo.dir, "docs/decisions/0040-beta.md"))).toBe(true);
  });
});
