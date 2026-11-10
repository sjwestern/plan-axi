import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string;
let bin: string;
let oldPath: string | undefined;
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const file = (): string => join(dir, ".plan-axi.toml");
const userFile = (): string => join(xdg, "plan-axi", "config.toml");
const read = (p: string): string => readFileSync(p, "utf8");

function fakePi(): void {
  const script = `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "  --thinking <level>             Set thinking level: off, minimal, low, medium, high, xhigh, max"
elif [ "$1" = "--list-models" ]; then
  echo "provider  model  context  max-out  thinking  images"
  echo "prov      good   1M       1K       yes       no"
  echo "prov      good-two   1M       1K       yes       no"
fi
`;
  writeFileSync(join(bin, "pi"), script);
  chmodSync(join(bin, "pi"), 0o755);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-cfg-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  bin = mkdtempSync(join(tmpdir(), "change-axi-bin-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  oldPath = process.env["PATH"];
  process.env["PATH"] = `${bin}:/usr/bin:/bin`;
  mkdirSync(join(dir, ".git"));
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  process.env["PATH"] = oldPath;
  for (const d of [dir, xdg, bin]) rmSync(d, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("config", () => {
  it("shows empty config", async () => {
    const r = await run("config");
    expect(r.code).toBe(0);
    expect(r.out).toContain("profiles: none");
    expect(r.out).toContain("default_tier: none");
  });

  it("writes the acceptance example, keeps comments and docs settings, and shows it", async () => {
    fakePi();
    writeFileSync(file(), '# keep me\n[docs]\ndir = "d" # inline\n');
    const r = await run("config", "--profile", "small", "--harness", "pi", "--model", "prov/good", "--effort", "low", "--tier", "small=small", "--rule", "standard=db migrations", "--default-tier", "small");
    expect(r.code).toBe(0);
    const t = read(file());
    expect(t).toContain("# keep me");
    expect(t).toContain('dir = "d" # inline');
    expect(t).toContain('[apply.agents.small]\nharness = "pi"\nmodel = "prov/good"\neffort = "low"');
    expect(t).toContain('[apply.tiers]\nsmall = "small"');
    expect(t).toContain('[propose.tiers]\nstandard = ["db migrations"]');
    expect(t).toContain('default_tier = "small"');
    expect(r.out).toContain("prov/good");
    const g = await run("guidance");
    expect(g.out).toContain("prov/good");
    expect(g.out).toContain("db migrations");
    const c = await run("config");
    expect(c.out).toContain("config --verify");
  });

  it("appends rules and clears them", async () => {
    await run("config", "--rule", "deep=a", "--rule", "deep=b");
    expect(read(file())).toContain('deep = ["a", "b"]');
    await run("config", "--rule", "deep=c");
    expect(read(file())).toContain('deep = ["a", "b", "c"]');
    await run("config", "--clear-rules", "deep");
    expect(read(file())).not.toContain("deep =");
  });

  it.each([
    [["--tier", "small=ghost"], /undefined profile .{1,3}ghost/],
    [["--tier", "huge=x"], /unknown tier .{1,3}huge/],
    [["--profile", "p", "--model", "a/b"], /needs harness or command/],
  ])("structural error %j leaves the file unchanged", async (flags, re) => {
    writeFileSync(file(), "# orig\n");
    const r = await run("config", ...flags);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(re);
    expect(read(file())).toBe("# orig\n");
  });

  it("invalid model errors, leaves file unchanged, and --force writes", async () => {
    fakePi();
    const flags = ["config", "--profile", "p", "--harness", "pi", "--model", "prov/nope"];
    const r = await run(...flags);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("--force");
    expect(existsSync(file())).toBe(false);
    const f = await run(...flags, "--force");
    expect(f.code).toBe(0);
    expect(f.out).toContain("written with --force");
    expect(read(file())).toContain("prov/nope");
  });

  it("bare model id is invalid and lists provider/model", async () => {
    fakePi();
    const r = await run("config", "--profile", "p", "--harness", "pi", "--model", "good");
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("prov/good");
    expect(existsSync(file())).toBe(false);
  });

  it("invalid effort errors", async () => {
    fakePi();
    const r = await run("config", "--profile", "p", "--harness", "pi", "--effort", "turbo");
    expect(r.code).not.toBe(0);
    expect(existsSync(file())).toBe(false);
  });

  it("missing harness warns and still writes", async () => {
    const r = await run("config", "--profile", "p", "--harness", "pi", "--model", "prov/good");
    expect(r.code).toBe(0);
    expect(r.out).toContain("pi not found on PATH");
    expect(read(file())).toContain("prov/good");
  });

  it("--user writes only the user file", async () => {
    await run("config", "--agent", "mytool {prompt}", "--user");
    expect(read(userFile())).toContain('agent = "mytool {prompt}"');
    expect(existsSync(file())).toBe(false);
    const r = await run("config");
    expect(r.out).toContain("mytool {prompt}");
  });

  it("repo tier can map to a user-defined profile", async () => {
    await run("config", "--profile", "u", "--command", "tool {prompt}", "--user");
    const r = await run("config", "--tier", "small=u");
    expect(r.code).toBe(0);
    expect(read(file())).toContain('small = "u"');
  });

  it("removes profiles and unsets tiers", async () => {
    await run("config", "--profile", "p", "--command", "tool {prompt}", "--tier", "small=p");
    const bad = await run("config", "--remove-profile", "p");
    expect(bad.code).not.toBe(0);
    const ok = await run("config", "--unset-tier", "small", "--remove-profile", "p");
    expect(ok.code).toBe(0);
    expect(read(file())).not.toContain("apply.agents.p");
  });

  it("validates commit style flags", async () => {
    expect((await run("config", "--commit-type", "Bad Type")).code).not.toBe(0);
    expect((await run("config", "--commit-type", "feat", "--commit-scope", "")).code).toBe(0);
    expect(read(file())).toContain('type = "feat"');
  });

  describe("--verify", () => {
    const seed = (): void => writeFileSync(file(), '[apply.agents.a]\nharness = "pi"\nmodel = "prov/good"\neffort = "low"\n[apply.agents.b]\nharness = "pi"\nmodel = "prov/nope"\n');
    it("ok with a valid profile", async () => {
      fakePi();
      seed();
      const r = await run("config", "--verify", "--profile", "a");
      expect(r.code).toBe(0);
      expect(r.out).toContain("ok");
      expect(r.out).not.toContain("prov/nope");
    });
    it("invalid exits non-zero and does not modify the file", async () => {
      fakePi();
      seed();
      const before = read(file());
      const r = await run("config", "--verify");
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("invalid");
      expect(read(file())).toBe(before);
    });
    it("skipped exits 0 with the reason", async () => {
      seed();
      const r = await run("config", "--verify");
      expect(r.code).toBe(0);
      expect(r.out).toContain("skipped");
      expect(r.out).toContain("pi not found on PATH");
    });
    it("rejects write flags", async () => {
      const r = await run("config", "--verify", "--default-tier", "small");
      expect(r.code).not.toBe(0);
      expect(existsSync(file())).toBe(false);
    });

    describe("config problems", () => {
      it("valid config: problems none, exit 0", async () => {
        fakePi();
        seed();
        const r = await run("config", "--verify");
        expect(r.out).toContain("problems: none");
        expect(r.code).toBe(1); // prov/nope is invalid
        writeFileSync(file(), '[apply.agents.a]\nharness = "pi"\nmodel = "prov/good"\n');
        const ok = await run("config", "--verify");
        expect(ok.out).toContain("problems: none");
        expect(ok.code).toBe(0);
      });
      it("typo key warns and exits 0", async () => {
        writeFileSync(file(), '[commit]\ntpye = "feat"\n');
        const r = await run("config", "--verify");
        expect(r.out).toContain("warning");
        expect(r.out).toContain('did you mean \\"commit.type\\"');
        expect(r.code).toBe(0);
      });
      it("bad tier and bad commit type exit 1 naming the file", async () => {
        writeFileSync(file(), '[apply.tiers]\nsmall = "ghost"\n[commit]\ntype = "Bad Type"\n');
        const r = await run("config", "--verify");
        expect(r.code).toBe(1);
        expect(r.out).toContain(file());
        expect(r.out).toContain('undefined profile \\"ghost\\"');
        expect(r.out).toContain("commit.type");
      });
      it("missing {prompt} is an error", async () => {
        writeFileSync(file(), '[apply]\nagent = "pi"\n');
        const r = await run("config", "--verify");
        expect(r.code).toBe(1);
        expect(r.out).toContain("{prompt}");
      });
      it("user + repo split: tier in repo maps to profile in user file", async () => {
        mkdirSync(join(xdg, "plan-axi"), { recursive: true });
        writeFileSync(userFile(), '[apply.agents.a]\ncommand = "echo {prompt}"\n[commit]\ntype = "Bad"\n');
        writeFileSync(file(), '[apply.tiers]\nsmall = "a"\n');
        const r = await run("config", "--verify");
        expect(r.code).toBe(1);
        expect(r.out).toContain(userFile());
        expect(r.out).not.toContain("undefined profile");
      });
      it("syntax error is reported for the file", async () => {
        writeFileSync(file(), "[apply\n");
        const r = await run("config", "--verify");
        expect(r.code).toBe(1);
        expect(r.out).toContain(file());
      });
      it("--profile limits live checks but still validates all config", async () => {
        fakePi();
        writeFileSync(file(), '[apply.agents.a]\nharness = "pi"\nmodel = "prov/good"\n[commit]\ntype = "Bad"\n');
        const r = await run("config", "--verify", "--profile", "a");
        expect(r.code).toBe(1);
        expect(r.out).toContain("commit.type");
        expect((await run("config", "--verify", "--profile", "zz")).code).not.toBe(0);
      });
      it("docs problems are listed", async () => {
        writeFileSync(file(), '[docs]\nadr = "nope"\n');
        const r = await run("config", "--verify");
        expect(r.code).toBe(1);
        expect(r.out).toContain("docs.adr");
      });
    });
  });
});
