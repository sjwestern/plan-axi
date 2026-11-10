import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseToml } from "docs-axi/lib/config";
import { describe, expect, it } from "vitest";
import { checkFile, checkMerged, checkText, sampleKeys } from "../src/configcheck.js";

const file = (text: string, name = "repo.toml") => checkFile(name, parseToml(text, name));
const msgs = (text: string) => file(text).map((p) => `${p.severity}:${p.key}:${p.message}`);

describe("checkFile", () => {
  it("accepts a valid file", () => {
    const t = `[apply]\nagent = "pi {prompt}"\n[apply.agents.a]\nharness = "pi"\nmodel = "x/y"\n[apply.tiers]\nsmall = "a"\n[propose]\ndefault_tier = "deep"\n[propose.tiers]\nsmall = ["a", "b"]\ndeep = "c"\n[commit]\ntype = "feat"\nscope = ""\ntrailer = "Change"\n[repos.r]\npath = "../r"\nplatform = "native"\n[docs]\ndir = "docs"\n`;
    expect(file(t)).toEqual([]);
  });

  it("reports bad [commit] values with the file and key", () => {
    const p = file('[commit]\ntype = "Bad Type"\ntrailer = "9x"\nscope = ""\nplan_type = ""\n', "u.toml");
    expect(p.map((x) => x.key).sort()).toEqual(["commit.plan_type", "commit.trailer", "commit.type"]);
    expect(p.every((x) => x.file === "u.toml" && x.severity === "error")).toBe(true);
  });

  it("rejects wrong types and bad tiers", () => {
    expect(msgs("[apply.agents.a]\nharness = true\n")).toEqual([expect.stringMatching(/^error:apply.agents.a.harness:.*must be a string/)]);
    expect(msgs('[apply.tiers]\nhuge = "a"\n')[0]).toMatch(/unknown tier "huge"/);
    expect(msgs("[apply.tiers]\nsmall = true\n")[0]).toMatch(/must map to a profile name/);
    expect(msgs('[propose]\ndefault_tier = "x"\n')[0]).toMatch(/default_tier/);
    expect(msgs("[propose.tiers]\nsmall = true\n")[0]).toMatch(/string or an array/);
    expect(msgs('[propose.tiers]\nbig = "x"\n')[0]).toMatch(/unknown tier "big"/);
  });

  it("checks repo keys, platform and path type", () => {
    expect(msgs('[repos.a]\nbogus = "x"\n')[0]).toMatch(/unknown key "bogus" in \[repos.a\]/);
    expect(msgs('[repos.a]\nplatform = "dos"\n')[0]).toMatch(/platform "dos" is not valid/);
    expect(msgs('[repos.a]\npath = ""\n')[0]).toMatch(/non-empty string/);
    expect(msgs('repos.a = "x"\n')[0]).toMatch(/must be inside a \[repos.<name>\] table/);
  });

  it("warns on unknown keys with a did-you-mean", () => {
    const p = file('[apply]\nagnet = "pi {prompt}"\n[commit]\ntpye = "feat"\n[apply.agents.a]\nharnes = "pi"\n');
    expect(p.every((x) => x.severity === "warning")).toBe(true);
    expect(p.map((x) => x.message)).toEqual([
      'unknown key "apply.agnet"; did you mean "apply.agent"?',
      'unknown key "commit.tpye"; did you mean "commit.type"?',
      'unknown key "apply.agents.a.harnes"; did you mean "apply.agents.a.harness"?',
    ]);
  });

  it("omits the hint for far-off unknown keys", () => {
    expect(msgs('[zzz]\nqqqqqq = "x"\n')).toEqual(['warning:zzz.qqqqqq:unknown key "zzz.qqqqqq"']);
  });

  it("requires {prompt} in apply.agent and profile command", () => {
    expect(msgs('[apply]\nagent = "pi"\n')[0]).toMatch(/^error:apply.agent:.*\{prompt\}/);
    expect(msgs('[apply.agents.a]\ncommand = "pi"\n')[0]).toMatch(/^error:apply.agents.a.command:.*\{prompt\}/);
    expect(file('[apply.agents.a]\nharness = "pi"\n')).toEqual([]);
  });

  it("warns on unknown placeholders but not shell variables", () => {
    expect(msgs('[apply]\nagent = "pi {prompt} {model}"\n')).toEqual(["warning:apply.agent:apply.agent: unknown placeholder {model}; known: {prompt}, {slug}, {step}, {path}, {repos}"]);
    expect(file('[apply]\nagent = "pi ${HOME} {prompt} {slug}"\n')).toEqual([]);
  });

  it("known-only docs keys pass without value checks", () => {
    expect(file('[docs]\ndir = ""\nsections = ["a"]\nadr = false\nignore = ["x"]\n[docs.map]\na = ["b"]\n[docs.section.a]\nguide = "g"\n')).toEqual([]);
  });
});

describe("checkText", () => {
  it("turns a syntax error into an error problem for the file", () => {
    const r = checkText("bad.toml", "[apply\n");
    expect(r.raw).toBeUndefined();
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ file: "bad.toml", severity: "error" });
  });
});

describe("checkMerged", () => {
  const f = (name: string, text: string) => ({ file: name, raw: parseToml(text, name) });

  it("accepts a tier mapped to a profile defined in the other file", () => {
    const user = f("user.toml", '[apply.agents.a]\nharness = "pi"\n');
    const repo = f("repo.toml", '[apply.tiers]\nsmall = "a"\n');
    expect(checkMerged([user, repo])).toEqual([]);
  });

  it("names the file holding an undefined tier mapping", () => {
    const user = f("user.toml", '[apply.agents.a]\nharness = "pi"\n');
    const repo = f("repo.toml", '[apply.tiers]\nsmall = "ghost"\n');
    expect(checkMerged([user, repo])).toEqual([
      { file: "repo.toml", key: "apply.tiers.small", severity: "error", message: 'tier "small" maps to undefined profile "ghost"' },
    ]);
  });

  it("lets a later file override a tier mapping", () => {
    const user = f("user.toml", '[apply.tiers]\nsmall = "ghost"\n');
    const repo = f("repo.toml", '[apply.agents.a]\nharness = "pi"\n[apply.tiers]\nsmall = "a"\n');
    expect(checkMerged([user, repo])).toEqual([]);
  });

  it("profile needs harness or command across files", () => {
    expect(checkMerged([f("u.toml", '[apply.agents.a]\nharness = "pi"\n'), f("r.toml", '[apply.agents.a]\nmodel = "m"\n')])).toEqual([]);
    const p = checkMerged([f("r.toml", '[apply.agents.a]\nmodel = "m"\n')]);
    expect(p[0]).toMatchObject({ file: "r.toml", severity: "error", message: 'agent profile "a" needs harness or command' });
  });

  it("repo path may live in either file", () => {
    expect(checkMerged([f("u.toml", '[repos.a]\npath = "../a"\n'), f("r.toml", '[repos.a]\nplatform = "windows"\n')])).toEqual([]);
    const p = checkMerged([f("u.toml", '[repos.a]\ngit = "git"\n')]);
    expect(p).toEqual([{ file: "u.toml", key: "repos.a.path", severity: "error", message: "[repos.a] needs path" }]);
  });
});

describe("schema coverage", () => {
  it("covers every config key read through loadRawConfig in src", () => {
    const dir = join(__dirname, "../src");
    const samples = sampleKeys();
    const missing: string[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts") || name === "configcheck.ts") continue;
      const text = readFileSync(join(dir, name), "utf8");
      if (!text.includes("loadRawConfig")) continue;
      for (const m of text.matchAll(/["'`]((?:apply|propose|commit|repos|docs)\.[A-Za-z_.${}]*)["'`]/g)) {
        const lit = m[1] as string;
        const ok = lit.endsWith(".")
          ? samples.some((s) => s.startsWith(lit))
          : samples.some((s) => new RegExp(`^${lit.replace(/[.]/g, "\\.").replace(/\$\{[^}]*\}/g, "[^.]+")}$`).test(s));
        if (!ok) missing.push(`${name}: ${lit}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
