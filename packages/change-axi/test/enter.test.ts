import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCommand, shellQuote } from "../src/agent.js";
import { main } from "../src/cli.js";

let dir: string;
let xdg: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  const code = typeof process.exitCode === "number" ? process.exitCode : 0;
  process.exitCode = undefined;
  return { out, code };
};
const P = "demo-change";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-enter-"));
  xdg = mkdtempSync(join(tmpdir(), "change-axi-xdg-"));
  process.env["XDG_CONFIG_HOME"] = xdg;
  delete process.env["CHANGE_AXI_AGENT"];
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
  git("checkout", "-q", "-b", P);
});
afterEach(() => {
  delete process.env["XDG_CONFIG_HOME"];
  delete process.env["CHANGE_AXI_AGENT"];
  rmSync(dir, { recursive: true, force: true });
  rmSync(xdg, { recursive: true, force: true });
});

function fakeAgent(): string {
  const script = join(dir, "fake-agent.sh");
  writeFileSync(script, `#!/bin/sh\npwd > "${dir}/agent.cwd"\nprintf '%s' "$1" > "${dir}/agent.arg"\n`);
  chmodSync(script, 0o755);
  writeFileSync(join(dir, ".plan-axi.toml"), `[apply]\nagent = "${script} {prompt}"\n`);
  return script;
}

describe("quoting", () => {
  it("quotes for POSIX and Windows", () => {
    expect(shellQuote("it's", "linux")).toBe(`'it'\\''s'`);
    expect(shellQuote('a "b"', "win32")).toBe('"a \\"b\\""');
    expect(buildCommand("x {prompt} {slug} {step}", { prompt: "apply a b", slug: "a", step: "b", path: "/p" }, "linux")).toBe("x 'apply a b' 'a' 'b'");
  });
});

describe("enter", () => {
  it("runs the configured agent in the worktree with the prompt", async () => {
    fakeAgent();
    const r = await run("enter", P, "--run");
    expect(r.code).toBe(0);
    expect(readFileSync(join(dir, "agent.arg"), "utf8")).toBe(`apply ${P} 01-do-it (orient with bare \`change-axi\`, it prints branch and worktree; do not run \`git branch --show-current\`)`);
    expect(readFileSync(join(dir, "agent.cwd"), "utf8").trim()).toBe(execFileSync("pwd", { cwd: dir, encoding: "utf8" }).trim());
  });

  it("passes the step", async () => {
    fakeAgent();
    await run("enter", P, "01-do-it", "--run");
    expect(readFileSync(join(dir, "agent.arg"), "utf8")).toBe(`apply ${P} 01-do-it (orient with bare \`change-axi\`, it prints branch and worktree; do not run \`git branch --show-current\`)`);
  });

  it("--print runs nothing", async () => {
    fakeAgent();
    const r = await run("enter", P, "--print");
    expect(existsSync(join(dir, "agent.arg"))).toBe(false);
    expect(r.out).toContain(`apply ${P}`);
    expect(r.out).toContain("command");
  });

  it("--agent uses a profile and names it", async () => {
    writeFileSync(join(dir, ".plan-axi.toml"), '[apply.agents.small]\nharness = "pi"\nmodel = "p/m"\neffort = "low"\n');
    const r = await run("enter", P, "01-do-it", "--agent", "small", "--print");
    expect(r.out).toContain("small (--agent small)");
    expect(r.out).toContain(`pi --model 'p/m' --thinking 'low' 'apply ${P} 01-do-it (orient with bare \`change-axi\`, it prints branch and worktree; do not run \`git branch --show-current\`)'`);
  });

  it("--agent with an unknown profile errors", async () => {
    const r = await run("enter", P, "--agent", "nope", "--print");
    expect(r.out).toContain("unknown agent profile");
    expect(r.code).not.toBe(0);
  });

  it("does not run without a TTY", async () => {
    fakeAgent();
    const r = await run("enter", P);
    expect(existsSync(join(dir, "agent.arg"))).toBe(false);
    expect(r.out).toContain("Not a TTY");
  });

  it("env CHANGE_AXI_AGENT is used when no config", async () => {
    process.env["CHANGE_AXI_AGENT"] = "echo {prompt}";
    const r = await run("enter", P, "--print");
    expect(r.out).toContain("CHANGE_AXI_AGENT");
  });

  it("explains how to configure when no agent is found", async () => {
    const saved = process.env["PATH"];
    const bins = ["pi", "claude", "codex", "gemini", "opencode"];
    process.env["PATH"] = (saved ?? "").split(delimiter).filter((d) => !bins.some((b) => existsSync(join(d, b)))).join(delimiter);
    try {
      const r = await run("enter", P);
      expect(r.out).toContain("No agent found");
      expect(r.out).toContain(`apply ${P}`);
    } finally {
      process.env["PATH"] = saved;
    }
  });

  it("hints about setup until the block exists", async () => {
    fakeAgent();
    expect((await run("enter", P, "--print")).out).toContain("change-axi setup");
    await run("setup");
    expect((await run("enter", P, "--print")).out).not.toContain("change-axi setup");
  });

  it("rejects an unknown step", async () => {
    const r = await run("enter", P, "99-nope", "--print");
    expect(r.code).not.toBe(0);
  });

  describe.skipIf(process.platform === "win32")("profile preflight", () => {
    let bin: string;
    let saved: string | undefined;
    const fakePi = (): void => {
      writeFileSync(
        join(bin, "pi"),
        `#!/bin/sh
if [ "$1" = "--help" ]; then
  echo "  --thinking <level>   Set thinking level: off, minimal, low, medium, high"
elif [ "$1" = "--list-models" ]; then
  echo "provider  model  context"
  echo "prov      good   1M"
else
  echo ran > "${dir}/pi.ran"
fi
`,
      );
      chmodSync(join(bin, "pi"), 0o755);
    };
    const profile = (extra: string): void => writeFileSync(join(dir, ".plan-axi.toml"), `[apply.agents.p]\nharness = "pi"\n${extra}`);
    beforeEach(() => {
      bin = mkdtempSync(join(tmpdir(), "change-axi-bin-"));
      saved = process.env["PATH"];
      process.env["PATH"] = `${bin}${delimiter}/usr/bin${delimiter}/bin`;
    });
    afterEach(() => {
      process.env["PATH"] = saved;
      rmSync(bin, { recursive: true, force: true });
    });

    it("blocks a run on invalid effort", async () => {
      fakePi();
      profile('model = "prov/good"\neffort = "ultra"\n');
      const r = await run("enter", P, "--agent", "p", "--run");
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("effort");
      expect(r.out).toContain("ultra");
      expect(r.out).toContain("--no-verify");
      expect(existsSync(join(dir, "pi.ran"))).toBe(false);
    });

    it("blocks a run on invalid model", async () => {
      fakePi();
      profile('model = "prov/nope"\n');
      const r = await run("enter", P, "--agent", "p", "--run");
      expect(r.code).not.toBe(0);
      expect(r.out).toContain("prov/nope");
      expect(existsSync(join(dir, "pi.ran"))).toBe(false);
    });

    it("--no-verify launches anyway", async () => {
      fakePi();
      profile('model = "prov/good"\neffort = "ultra"\n');
      const r = await run("enter", P, "--agent", "p", "--run", "--no-verify");
      expect(r.code).toBe(0);
      expect(existsSync(join(dir, "pi.ran"))).toBe(true);
    });

    it("print mode warns instead of blocking", async () => {
      fakePi();
      profile('effort = "ultra"\n');
      const r = await run("enter", P, "--agent", "p", "--print");
      expect(r.code).toBe(0);
      expect(r.out).toContain("warning");
      expect(r.out).toContain("ultra");
    });

    it("skipped check warns and still launches", async () => {
      process.env["PATH"] = `${bin}${delimiter}/usr/bin${delimiter}/bin`;
      writeFileSync(join(bin, "pi"), `#!/bin/sh\necho ran > "${dir}/pi.ran"\n`);
      chmodSync(join(bin, "pi"), 0o755);
      profile('model = "prov/good"\n');
      const r = await run("enter", P, "--agent", "p", "--run");
      expect(r.code).toBe(0);
      expect(r.out).toContain("not verified");
      expect(existsSync(join(dir, "pi.ran"))).toBe(true);
    });

    it("non-profile agent is unchanged", async () => {
      fakeAgent();
      const r = await run("enter", P, "--run");
      expect(r.code).toBe(0);
      expect(r.out).not.toContain("warning");
    });
  });
});
