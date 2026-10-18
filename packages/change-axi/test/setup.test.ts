import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySetup, END_MARK, hasSetupBlock, removeSetup, SETUP_BLOCK, START_MARK } from "../src/setup.js";

let dir: string;
const f = () => join(dir, "AGENTS.md");
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "change-axi-setup-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("setup", () => {
  it("block points agents at docs and exploration", () => {
    expect(SETUP_BLOCK).toContain("docs-axi search");
    expect(SETUP_BLOCK).toContain("rg <terms> docs/");
    expect(SETUP_BLOCK).toContain("For exploration and planning tasks, look at the docs first");
  });

  it("creates a missing file and removes it again", () => {
    expect(applySetup(dir).created).toBe(true);
    expect(hasSetupBlock(dir)).toBe(true);
    removeSetup(dir);
    expect(existsSync(f())).toBe(false);
  });

  it("appends to an existing file, is idempotent, and remove restores bytes", () => {
    const orig = "# Rules\n\n- be nice\n";
    writeFileSync(f(), orig);
    expect(applySetup(dir).changed).toBe(true);
    const once = readFileSync(f(), "utf8");
    expect(applySetup(dir).changed).toBe(false);
    expect(readFileSync(f(), "utf8")).toBe(once);
    expect(once.split(START_MARK).length - 1).toBe(1);
    expect(once.startsWith(orig)).toBe(true);
    removeSetup(dir);
    expect(readFileSync(f(), "utf8")).toBe(orig);
  });

  it("falls back to CLAUDE.md and handles an empty file", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "");
    expect(applySetup(dir).path).toBe(join(dir, "CLAUDE.md"));
    removeSetup(dir);
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
  });

  it("keeps CRLF and text outside the markers", () => {
    const orig = "# Rules\r\n\r\nx\r\n";
    writeFileSync(f(), orig);
    applySetup(dir);
    const s = readFileSync(f(), "utf8");
    expect(s.replace(/\r\n/g, "")).not.toContain("\n");
    removeSetup(dir);
    expect(readFileSync(f(), "utf8")).toBe(orig);
  });

  it("refreshes a stale block in place, keeping surrounding text and CRLF", () => {
    const stale = `${START_MARK}\nold\n${END_MARK}`;
    writeFileSync(f(), `before\r\n${stale.replace(/\n/g, "\r\n")}\r\nafter\r\n`);
    expect(applySetup(dir).changed).toBe(true);
    const out = readFileSync(f(), "utf8");
    expect(out).toBe(`before\n${SETUP_BLOCK}\nafter\n`.replace(/\n/g, "\r\n"));
    expect(applySetup(dir).changed).toBe(false);
    removeSetup(dir);
    expect(readFileSync(f(), "utf8")).toBe("before\r\nafter\r\n");
  });

  it("honors an explicit file", () => {
    writeFileSync(f(), "a\n");
    applySetup(dir, "OTHER.md");
    expect(readFileSync(join(dir, "OTHER.md"), "utf8")).toContain(START_MARK);
    expect(readFileSync(f(), "utf8")).toBe("a\n");
  });
});
