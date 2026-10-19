import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETUP_BLOCK } from "../src/setup.js";

const root = join(__dirname, "..", "..", "..");
const BANNED = /docs\/(domain|architecture|decisions)/;

describe("no hard-coded docs layout", () => {
  it("skills do not name layout folders", () => {
    const dir = join(root, "skills");
    const skills = existsSync(dir) ? readdirSync(dir) : [];
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      const f = join(dir, s, "SKILL.md");
      if (existsSync(f)) expect(BANNED.test(readFileSync(f, "utf8")), f).toBe(false);
    }
  });
  it("setup.ts and its block do not name layout folders and mention docs-axi config", () => {
    expect(BANNED.test(readFileSync(join(root, "packages/change-axi/src/setup.ts"), "utf8"))).toBe(false);
    expect(SETUP_BLOCK).toContain("docs-axi config");
  });
});
