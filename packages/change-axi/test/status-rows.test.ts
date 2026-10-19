import { describe, expect, it } from "vitest";
import { parseStatusJson, parseStatusRows } from "../src/start.js";

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

describe("parseStatusJson", () => {
  it("maps lease_holder, status and branch", () => {
    const out = JSON.stringify([
      { name: "1", path: "/p/1", status: "leased", branch: "my-change", lease_holder: "my-change" },
      { name: "2", path: "/p/2", status: "leased", branch: "", detached: true, lease_holder: "other" },
      { name: "3", path: "/p/3", status: "available", branch: "", lease_holder: "" },
    ]);
    expect(parseStatusJson(out)).toEqual([
      { name: "1", path: "/p/1", branch: "my-change", leaseHolder: "my-change", status: "leased" },
      { name: "2", path: "/p/2", leaseHolder: "other", status: "leased" },
      { name: "3", path: "/p/3", status: "available" },
    ]);
  });
  it("returns undefined for non-JSON text so the text parser is used", () => {
    expect(parseStatusJson(OUT)).toBeUndefined();
    expect(parseStatusJson("{}")).toBeUndefined();
  });
});
