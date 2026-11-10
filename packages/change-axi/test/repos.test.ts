import { describe, expect, it } from "vitest";
import { repoConfigs, planConfigProblems } from "../src/planconfig.js";
import { detectHost, repoRuntime, type HostEnv, type RunResult } from "../src/repos.js";
import { parseToml } from "docs-axi/lib/config";

type Call = { cmd: string; args: string[]; cwd?: string };

function host(over: Partial<HostEnv>, calls: Call[] = [], replies: Record<string, string> = {}): HostEnv {
  return {
    platform: "linux",
    env: {},
    home: "/home/me",
    run: (cmd, args, opts): RunResult => {
      calls.push({ cmd, args, ...(opts.cwd ? { cwd: opts.cwd } : {}) });
      const key = cmd === "wslpath" ? `wslpath ${args.join(" ")}` : cmd;
      return { status: 0, stdout: replies[key] ?? "", stderr: "" };
    },
    ...over,
  };
}

const WSL = { platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" } };
const WSLREPLIES = {
  "cmd.exe": "C:\\Users\\me\r\n",
  "wslpath -u C:\\Users\\me": "/mnt/c/Users/me",
  "wslpath -w /mnt/c/Users/me/src/app": "C:\\Users\\me\\src\\app",
  "wslpath -u C:\\Users\\me\\.treehouse\\app\\1": "/mnt/c/Users/me/.treehouse/app/1",
};

describe("detectHost", () => {
  it("separates wsl, windows and other", () => {
    expect(detectHost({ platform: "linux", env: { WSL_DISTRO_NAME: "U" } })).toBe("wsl");
    expect(detectHost({ platform: "linux", env: { WSL_INTEROP: "/run/x" } })).toBe("wsl");
    expect(detectHost({ platform: "win32", env: {} })).toBe("windows");
    expect(detectHost({ platform: "darwin", env: {} })).toBe("other");
    expect(detectHost({ platform: "linux", env: {} })).toBe("other");
  });
});

describe("repoRuntime", () => {
  it("WSL + windows repo: Windows home, git.exe, pwsh treehouse, path conversion", () => {
    const calls: Call[] = [];
    const rt = repoRuntime(
      { name: "app", path: "~/src/app", platform: "windows" },
      host({ ...WSL }, calls, { ...WSLREPLIES, "pwsh.exe": "leased C:\\Users\\me\\.treehouse\\app\\1 ok\r\n" }),
    );
    expect(rt.path).toBe("/mnt/c/Users/me/src/app");
    expect(rt.nativePath).toBe("C:\\Users\\me\\src\\app");
    expect(rt.viaWindows).toBe(true);
    rt.git(["status"]);
    expect(calls.at(-1)).toEqual({ cmd: "git.exe", args: ["status"], cwd: "/mnt/c/Users/me/src/app" });
    const out = rt.treehouse(["get", "--lease"]);
    const th = calls.at(-2) as Call;
    expect(th.cmd).toBe("pwsh.exe");
    expect(th.args.at(-1)).toBe("& treehouse 'get' '--lease'");
    expect(th.cwd).toBe("/mnt/c/Users/me/src/app");
    expect(out).toBe("leased /mnt/c/Users/me/.treehouse/app/1 ok");
    expect(rt.toWsl("C:\\x")).toBe("C:\\x");
  });

  it("WSL + windows repo with an absolute Windows path converts it", () => {
    const rt = repoRuntime(
      { name: "app", path: "C:\\Users\\me\\src", platform: "windows" },
      host({ ...WSL }, [], { ...WSLREPLIES, "wslpath -u C:\\Users\\me\\src": "/mnt/c/Users/me/src" }),
    );
    expect(rt.path).toBe("/mnt/c/Users/me/src");
  });

  it("WSL + native repo uses Linux home and plain tools", () => {
    const calls: Call[] = [];
    const rt = repoRuntime({ name: "x", path: "~/code/x", platform: "native" }, host({ ...WSL }, calls));
    expect(rt.path).toBe("/home/me/code/x");
    expect(rt.viaWindows).toBe(false);
    rt.git(["log"]);
    rt.treehouse(["status"]);
    expect(calls.map((c) => c.cmd)).toEqual(["git", "treehouse"]);
    expect(calls.some((c) => c.cmd === "cmd.exe")).toBe(false);
  });

  it("native Windows runs git and treehouse.exe directly and ignores platform", () => {
    const calls: Call[] = [];
    const rt = repoRuntime({ name: "w", path: "C:\\src\\w", platform: "windows" }, host({ platform: "win32", home: "C:\\Users\\me" }, calls));
    expect(rt.path).toBe("C:\\src\\w");
    expect(rt.viaWindows).toBe(false);
    rt.git(["status"]);
    rt.treehouse(["status"]);
    expect(calls.map((c) => c.cmd)).toEqual(["git", "treehouse.exe"]);
  });

  it.each(["linux", "darwin"])("%s ignores platform=windows", (platform) => {
    const calls: Call[] = [];
    const rt = repoRuntime({ name: "m", path: "~/m", platform: "windows" }, host({ platform, home: "/h" }, calls));
    expect(rt.path).toBe("/h/m");
    expect(rt.viaWindows).toBe(false);
    rt.git(["status"]);
    expect(calls[0]?.cmd).toBe("git");
  });

  it("override commands win over platform defaults and skip the pwsh wrapper", () => {
    const calls: Call[] = [];
    const rt = repoRuntime(
      { name: "app", path: "~/src/app", platform: "windows", git: "wsl-git --flag", treehouse: "th.exe" },
      host({ ...WSL }, calls, { ...WSLREPLIES, "th.exe": "ok" }),
    );
    rt.git(["status"]);
    expect(calls.at(-1)).toMatchObject({ cmd: "wsl-git", args: ["--flag", "status"] });
    rt.treehouse(["status"]);
    expect(calls.at(-1)).toMatchObject({ cmd: "th.exe", args: ["status"] });
  });

  it("allowFail swallows git errors; failures map to AxiError", () => {
    const h = host({}, [], {});
    h.run = () => ({ status: 1, stdout: "", stderr: "fatal: nope" });
    const rt = repoRuntime({ name: "x", path: "/r", platform: "native" }, h);
    expect(rt.git(["x"], { allowFail: true })).toBe("");
    expect(() => rt.git(["x"])).toThrow(/git x failed: fatal: nope/);
    h.run = () => ({ status: null, stdout: "", stderr: "", error: "ENOENT" });
    expect(() => rt.treehouse(["get"])).toThrow(/treehouse not found/);
  });
});

describe("repos config", () => {
  it("parses [repos.<name>] and validates", () => {
    const raw = parseToml('[repos.app]\npath = "~/src/app"\nplatform = "windows"\ngit = "g"\n[repos.lib]\npath = "/x"\n', "t");
    expect(repoConfigs(raw)).toEqual([
      { name: "app", path: "~/src/app", platform: "windows", git: "g" },
      { name: "lib", path: "/x", platform: "native" },
    ]);
    expect(planConfigProblems(raw)).toEqual([]);
    const bad = parseToml('[repos.a]\nplatform = "amiga"\nfoo = "1"\n', "t");
    const p = planConfigProblems(bad).join("\n");
    expect(p).toMatch(/platform "amiga"/);
    expect(p).toMatch(/unknown key "foo"/);
    expect(p).toMatch(/\[repos.a\] needs path/);
  });
});
