import { describe, expect, it } from "vitest";
import { parseStatusRows } from "../src/start.js";

const OUT = `base  main  (repository default)
1     leased       ~/.treehouse/repo-abc/1/repo  [my-change]
                   head (123)
2     available    /abs/pool/2/repo  (detached)
`;

describe("parseStatusRows", () => {
  it("expands a leading ~ to the home dir", () => {
    const rows = parseStatusRows(OUT, "/home/u");
    expect(rows[0]).toEqual({ name: "1", path: "/home/u/.treehouse/repo-abc/1/repo", branch: "my-change" });
  });
  it("keeps absolute paths and omits branch when absent", () => {
    expect(parseStatusRows(OUT, "/home/u")[1]).toEqual({ name: "2", path: "/abs/pool/2/repo" });
  });
});
