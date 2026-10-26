import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTomlEdit, quote, removeKey, removeTable, upsertKey } from "../src/tomlwrite.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tomlwrite-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("tomlwrite", () => {
  it("upserts into a new table", () => {
    const lines = [""];
    upsertKey(lines, "a", "k", quote("v"));
    expect(lines.join("\n")).toBe('\n[a]\nk = "v"');
  });

  it("upserts into an existing table and replaces a key, keeping comments", () => {
    const lines = ["[a]", 'k = "old" # note', "[b]", "x = 1"];
    upsertKey(lines, "a", "k", '"new"');
    upsertKey(lines, "a", "z", "2");
    expect(lines).toEqual(["[a]", 'k = "new" # note', "z = 2", "[b]", "x = 1"]);
  });

  it("removes keys and tables", () => {
    const lines = ["[a]", "k = 1", "j = 2", "[b]", "x = 1"];
    expect(removeKey(lines, "a", "k")).toBe(true);
    expect(removeKey(lines, "a", "k")).toBe(false);
    expect(removeTable(lines, "b")).toBe(true);
    expect(removeTable(lines, "b")).toBe(false);
    expect(lines).toEqual(["[a]", "j = 2"]);
  });

  it("applyTomlEdit treats ENOENT as empty, keeps CRLF, and validates before writing", () => {
    const path = join(dir, "c.toml");
    applyTomlEdit(path, (l) => upsertKey(l, "a", "k", "1"), () => {});
    expect(readFileSync(path, "utf8")).toBe("\n[a]\nk = 1");
    writeFileSync(path, "[a]\r\nk = 1\r\n", "utf8");
    applyTomlEdit(path, (l) => upsertKey(l, "a", "k", "2"), () => {});
    expect(readFileSync(path, "utf8")).toBe("[a]\r\nk = 2\r\n");
    expect(() =>
      applyTomlEdit(path, (l) => upsertKey(l, "a", "k", "3"), () => {
        throw new Error("bad");
      }),
    ).toThrow("bad");
    expect(readFileSync(path, "utf8")).toBe("[a]\r\nk = 2\r\n");
  });
});
