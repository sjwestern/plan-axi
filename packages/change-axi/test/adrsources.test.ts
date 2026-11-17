import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSourceAdrs } from "../src/adrsources.js";
import { repoConfigs, validatePlanConfig } from "../src/planconfig.js";
import { parseToml } from "docs-axi/lib/config";

let plan: string;
let code: string;
let xdg: string;

const writeAdr = (root: string, dir: string, file: string, title: string): void => {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, file), `---\ntitle: ${title}\nsummary: ${title} summary\nstatus: accepted\n---\n\n# ${title}\n`);
};
const planCfg = (t: string): void => writeFileSync(join(plan, ".plan-axi.toml"), t);

beforeEach(() => {
  plan = mkdtempSync(join(tmpdir(), "change-axi-plan-"));
  code = mkdtempSync(join(tmpdir(), "change-axi-code-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  for (const d of [plan, code, xdg]) rmSync(d, { recursive: true, force: true });
});

describe("repo docs key", () => {
  it("parses docs and leaves it unset otherwise", () => {
    const raw = parseToml('[repos.a]\npath = "/x"\ndocs = "docs"\n[repos.b]\npath = "/y"\n', "t.toml");
    expect(repoConfigs(raw).map((r) => [r.name, r.docs])).toEqual([["a", "docs"], ["b", undefined]]);
  });
  it("rejects absolute and parent paths", () => {
    expect(() => validatePlanConfig('[repos.a]\npath = "/x"\ndocs = "/etc"\n')).toThrow(/relative directory/);
    expect(() => validatePlanConfig('[repos.a]\npath = "/x"\ndocs = "../docs"\n')).toThrow(/relative directory/);
    expect(() => validatePlanConfig('[repos.a]\npath = "/x"\ndocs = "docs"\n')).not.toThrow();
  });
});

describe("loadSourceAdrs", () => {
  it("returns ADRs of a source repo tagged with its name", () => {
    writeAdr(code, "docs/decisions", "0009-legacy-first.md", "Legacy first");
    planCfg(`[repos.app]\npath = "${code}"\ndocs = "docs"\n`);
    const r = loadSourceAdrs(plan);
    expect(r.unavailable).toEqual([]);
    expect(r.adrs).toMatchObject([{ number: 9, slug: "legacy-first", repo: "app" }]);
  });
  it("skips repos without a docs key and the plan repo itself", () => {
    writeAdr(code, "docs/decisions", "0001-x.md", "X");
    planCfg(`[repos.app]\npath = "${code}"\n[repos.self]\npath = "${plan}"\ndocs = "docs"\n`);
    expect(loadSourceAdrs(plan)).toEqual({ adrs: [], unavailable: [] });
  });
  it("reports a missing docs dir or checkout instead of throwing", () => {
    planCfg(`[repos.app]\npath = "${code}"\ndocs = "docs"\n[repos.gone]\npath = "${join(code, "nope")}"\ndocs = "docs"\n`);
    expect(loadSourceAdrs(plan)).toEqual({ adrs: [], unavailable: ["app", "gone"] });
  });
  it("uses the source repo's own docs layout", () => {
    writeFileSync(join(code, ".plan-axi.toml"), '[docs]\ndir = "documentation"\n');
    writeAdr(code, "documentation/decisions", "0004-own-layout.md", "Own layout");
    planCfg(`[repos.app]\npath = "${code}"\ndocs = "documentation"\n`);
    expect(loadSourceAdrs(plan).adrs).toMatchObject([{ number: 4, repo: "app" }]);
  });
});
