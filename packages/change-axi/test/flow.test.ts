import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tempRepo } from "./helpers.js";

let repo: ReturnType<typeof tempRepo>;
beforeEach(() => {
  repo = tempRepo();
  process.env["TASKS_AXI_FILE"] = "";
});
afterEach(() => repo.cleanup());
const read = (rel: string): string => readFileSync(join(repo.dir, rel), "utf8");
const P = "specs/changes/active/demo-change";

describe("change-axi", () => {
  it("spec lists required sections", async () => {
    const r = await repo.run("spec", "proposal");
    expect(r.out).toContain("Docs impact");
    expect((await repo.run("spec", "step")).out).toContain("Done when");
  });

  it("scaffolds, writes sections, tracks deps, and checks", async () => {
    const n = await repo.run("new", "demo-change", "Demo change");
    expect(n.code).toBe(0);
    expect(existsSync(join(repo.dir, `${P}/proposal.md`))).toBe(true);
    expect(read("backlog.md")).toContain("demo-change");
    const dup = await repo.run("new", "demo-change", "Demo change");
    expect(dup.code).not.toBe(0);
    expect(dup.out).toContain("is taken");
    expect((await repo.run("new", "Bad Slug", "x")).code).not.toBe(0);

    const s1 = await repo.run("step", "add", "demo-change", "Build schema", "--owns", "src/db/");
    expect(s1.out).toContain("01-build-schema");
    const s2 = await repo.run("step", "add", "demo-change", "Build api", "--owns", "src/db/,src/api/");
    expect(s2.out).toContain("02-build-api");
    expect(read(`${P}/tasks.md`)).toContain("Spec: 02-build-api.md");

    let c = await repo.run("check", "demo-change");
    expect(c.code).toBe(1);
    expect(c.out).toContain('EMPTY_SECTION: proposal.md: Why; Context;');
    expect(c.out).toContain("OVERLAP: 01-build-schema and 02-build-api");

    expect((await repo.run("dep", "demo-change", "02", "--on", "01")).out).toContain("blocked_by 01-build-schema");
    expect((await repo.run("dep", "demo-change", "01", "--on", "02")).out).toContain("cycle");
    expect((await repo.run("status", "demo-change")).out).toContain("ready: 01-build-schema");

    for (const sec of ["Context", "Why", "What changes", "Out of scope", "Approach", "Acceptance", "Docs impact", "Risks and open questions"]) {
      await repo.run("write", "demo-change", "proposal", "--section", sec, "--body", `${sec} text`);
    }
    await repo.run("write", "demo-change", "proposal", "--section", "Steps", "--body", "- `01-build-schema.md` - s\n- `02-build-api.md` - a");
    for (const step of ["01", "02"]) {
      for (const sec of ["Goal", "Context", "Work", "Done when"]) {
        await repo.run("write", "demo-change", step, "--section", sec, "--body", "x");
      }
    }
    c = await repo.run("check", "demo-change", "--waves");
    expect(c.out).toContain("ok (2 tasks");
    expect(c.code).toBe(0);
    expect(c.out).toContain("wave");

    await repo.run("step", "set", "demo-change", "02", "--owns", "src/api/", "--docs", "docs/domain/x.md");
    expect(read(`${P}/02-build-api.md`)).toContain("Owns: src/api/\nDocs: docs/domain/x.md");
    expect((await repo.run("show", "demo-change", "02", "--section", "Goal")).out).toContain("x");
  });

  it("creates a second change when backlog.md already exists", async () => {
    await repo.run("new", "demo-change", "Demo change");
    expect((await repo.run("new", "other-change", "Other")).code).toBe(0);
    expect(read("backlog.md")).toContain("other-change");
  });

  it("flags an orphan step file and a tool-dir Owns not named in the proposal", async () => {
    await repo.run("new", "demo-change", "Demo change");
    await repo.run("step", "add", "demo-change", "Edit skills", "--owns", ".agents/skills/foo/");
    const c = await repo.run("check", "demo-change");
    expect(c.out).toContain("OWNS_TOOL_DIR");
  });

  it("step add --after resolves prefix ids", async () => {
    await repo.run("new", "demo-change", "Demo change");
    await repo.run("step", "add", "demo-change", "Build schema", "--owns", "src/db/");
    const r = await repo.run("step", "add", "demo-change", "Build api", "--owns", "src/api/", "--after", "01");
    expect(r.code).toBe(0);
    expect(r.out).toContain("blocked_by: 01-build-schema");
    const bad = await repo.run("step", "add", "demo-change", "Other", "--owns", "src/x/", "--after", "09");
    expect(bad.code).not.toBe(0);
    expect(bad.out).toContain("NOT_FOUND");
  });
});
