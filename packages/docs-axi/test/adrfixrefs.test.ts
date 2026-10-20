import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
const read = (p: string): string => readFileSync(join(repo.dir, p), "utf8");
const write = (p: string, t: string): void => {
  mkdirSync(join(repo.dir, p, ".."), { recursive: true });
  writeFileSync(join(repo.dir, p), t);
};
const adr = (slug: string): string => `---\ntitle: ${slug}\nsummary: s\nstatus: proposed\n---\n\n# ${slug}\n`;
const doc = (body: string): string => `---\ntitle: T\nsummary: s\n---\n${body}\n`;

beforeEach(async () => {
  repo = tempRepo();
  await repo.run("init");
  write("docs/decisions/0003-alpha.md", adr("alpha"));
  write("docs/decisions/0005-beta.md", adr("beta"));
  write("docs/decisions/0009-gamma.md", adr("gamma"));
  write("docs/decisions/0010-gamma-two.md", adr("gamma-two"));
});
afterEach(() => repo.cleanup());

describe("adr fix-refs", () => {
  it("rewrites bare and stale refs in docs, active and archived; leaves code alone", async () => {
    write("docs/domain/a.md", doc("See ADR 3, ADR 0005, ADR-3 and ADR-0003.\nStale: ADR-0005-old-name; moved: ADR-0042-alpha.\n```\nADR 3\n```\nInline `ADR 3`."));
    write("specs/changes/active/x/proposal.md", "Uses ADR 5.\n");
    write("specs/changes/archived/2024-01-01-o/proposal.md", "Uses ADR-0003.\n");
    const r = await repo.run("adr", "fix-refs");
    expect(r.code).toBe(0);
    const a = read("docs/domain/a.md");
    expect(a).toContain("See ADR-0003-alpha, ADR-0005-beta, ADR-0003-alpha and ADR-0003-alpha.");
    expect(a).toContain("Stale: ADR-0005-beta; moved: ADR-0003-alpha.");
    expect(a).toContain("```\nADR 3\n```");
    expect(a).toContain("Inline `ADR 3`.");
    expect(read("specs/changes/active/x/proposal.md")).toBe("Uses ADR-0005-beta.\n");
    expect(read("specs/changes/archived/2024-01-01-o/proposal.md")).toBe("Uses ADR-0003-alpha.\n");
    expect((await repo.run("check")).out).not.toContain("ADR_REF");
  });

  it("lists ambiguous and unknown refs, leaves them unchanged, exits 1", async () => {
    write("docs/decisions/0009-delta.md", adr("delta"));
    write("docs/domain/a.md", doc("Clash ADR 9 and unknown ADR 77."));
    const r = await repo.run("adr", "fix-refs");
    expect(r.code).toBe(1);
    expect(r.out).toContain("ADR 9");
    expect(r.out).toContain("ADR-0009-gamma");
    expect(r.out).toContain("ADR 77");
    expect(r.out).toContain("adr renumber");
    expect(read("docs/domain/a.md")).toContain("Clash ADR 9 and unknown ADR 77.");
  });

  it("dry-run writes nothing", async () => {
    write("docs/domain/a.md", doc("See ADR 3."));
    const r = await repo.run("adr", "fix-refs", "--dry-run");
    expect(r.out).toContain("would fix 1");
    expect(read("docs/domain/a.md")).toContain("See ADR 3.");
  });

  it("reports docs that reference a change, and a second run is a no-op", async () => {
    write("docs/domain/a.md", doc("Made by change:foo. See ADR 3."));
    const r = await repo.run("adr", "fix-refs");
    expect(r.out).toContain("docs_reference_changes");
    expect(read("docs/domain/a.md")).toContain("change:foo");
    const again = await repo.run("adr", "fix-refs");
    expect(again.out).toContain("no-op");
    expect(again.code).toBe(0);
  });
});
