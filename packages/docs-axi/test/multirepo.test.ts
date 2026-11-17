import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let code: string;
let t: ReturnType<typeof tempRepo>;

const adr = (root: string, file: string, title: string, body = ""): void => {
  mkdirSync(join(root, "docs/decisions"), { recursive: true });
  writeFileSync(join(root, "docs/decisions", file), `---\ntitle: ${title}\nsummary: ${title} summary\nstatus: accepted\n---\n\n# ${title}\n\n${body}\n`);
};
const doc = (root: string, file: string, title: string, body: string): void => {
  mkdirSync(join(root, "docs/architecture"), { recursive: true });
  writeFileSync(join(root, "docs/architecture", file), `---\ntitle: ${title}\nsummary: ${title} summary\n---\n\n# ${title}\n\n${body}\n`);
};

beforeEach(async () => {
  t = tempRepo();
  code = mkdtempSync(join(tmpdir(), "docs-axi-code-"));
  mkdirSync(join(code, ".git"));
  adr(code, "0009-legacy-first.md", "Legacy first");
  doc(code, "billing.md", "Billing rules", "Invoices use the portal.");
  adr(t.dir, "0001-own-decision.md", "Own decision");
  doc(t.dir, "flow.md", "Flow", "Plans live here.");
  writeFileSync(join(t.dir, ".plan-axi.toml"), `[repos.app]\npath = "${code}"\ndocs = "docs"\n`);
  await t.run("index");
});
afterEach(() => {
  t.cleanup();
  rmSync(code, { recursive: true, force: true });
});

describe("docs across repos", () => {
  it("reads another repo with --repo", async () => {
    const r = await t.run("search", "invoices", "--repo", "app");
    expect(r.out).toContain("architecture/billing.md");
    expect((await t.run("search", "invoices")).out).not.toContain("billing.md");
    expect((await t.run("show", "decisions/0009-legacy-first.md", "--repo", "app")).out).toContain("Legacy first");
  });

  it("lists and searches every repo with --all-repos", async () => {
    const r = await t.run("adr", "list", "--all-repos");
    expect(r.out).toContain("0001");
    expect(r.out).toContain("0009");
    expect(r.out).toContain("app:");
    const s = await t.run("search", "plans invoices", "--all-repos");
    expect(s.out).toContain("flow.md");
  });

  it("refuses writes, --all-repos with show, and unknown repos", async () => {
    expect((await t.run("new", "architecture", "X", "--summary", "y", "--repo", "app")).out).toContain("only work with read commands");
    expect((await t.run("show", "architecture/flow.md", "--all-repos")).out).toContain("--all-repos works with");
    const unknown = await t.run("search", "x", "--repo", "nope");
    expect(unknown.code).not.toBe(0);
    expect(unknown.out).toContain("Repos: app");
  });

  it("check resolves plain and qualified refs to a source repo and flags wrong ones", async () => {
    doc(t.dir, "cites.md", "Cites", "See ADR-0009-legacy-first and app:ADR-0009-legacy-first.");
    await t.run("index");
    expect((await t.run("check")).out).not.toContain("ADR_REF");
    doc(t.dir, "cites.md", "Cites", "See ADR-0009-wrong and nope:ADR-0009-legacy-first.");
    await t.run("index");
    const r = await t.run("check");
    expect(r.out).toContain("ADR_REF_UNKNOWN");
  });

  it("check warns when a source repo is unreadable", async () => {
    rmSync(join(code, "docs"), { recursive: true, force: true });
    const r = await t.run("check");
    expect(r.out).toContain("ADR_SOURCE_UNAVAILABLE");
  });
});
