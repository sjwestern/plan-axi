import { describe, expect, it } from "vitest";
import { formatScalar, parseDoc, setFrontmatter } from "../src/frontmatter.js";

describe("frontmatter", () => {
  it("parses scalars, quoted strings and lists", () => {
    const p = parseDoc('---\ntitle: Hello\nsummary: "A: b"\ntags: [a, b-c]\n---\n\n# Body\n');
    expect(p.errors).toEqual([]);
    expect(p.data).toEqual({ title: "Hello", summary: "A: b", tags: ["a", "b-c"] });
    expect(p.body).toBe("\n# Body\n");
  });

  it("reports unclosed frontmatter and bad lines", () => {
    expect(parseDoc("---\ntitle: x\n").errors.length).toBe(1);
    expect(parseDoc("---\nnot a pair\n---\n").errors.length).toBe(1);
  });

  it("treats files without fences as body only", () => {
    const p = parseDoc("# Just a doc\n");
    expect(p.hasFrontmatter).toBe(false);
    expect(p.body).toBe("# Just a doc\n");
  });

  it("quotes values that YAML would misread", () => {
    expect(formatScalar("plain words")).toBe("plain words");
    expect(formatScalar("0001")).toBe('"0001"');
    expect(formatScalar("true")).toBe('"true"');
    expect(formatScalar("has: colon")).toBe('"has: colon"');
  });

  it("edits only the requested keys, preserving other lines and CRLF", () => {
    const src = "---\r\ntitle: A\r\n# keep me\r\nsummary: old\r\nextra: 1\r\n---\r\nbody\r\n";
    const out = setFrontmatter(src, { summary: "new one", tags: ["x"] });
    expect(out).toBe("---\r\ntitle: A\r\n# keep me\r\nsummary: new one\r\nextra: 1\r\ntags: [x]\r\n---\r\nbody\r\n");
    expect(setFrontmatter(out, { summary: "new one" })).toBe(out);
  });

  it("removes keys with undefined", () => {
    const out = setFrontmatter("---\ntitle: A\ntags: [x]\n---\nb\n", { tags: undefined });
    expect(out).toBe("---\ntitle: A\n---\nb\n");
  });
});
