import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { AxiError } from "axi-sdk-js";
import { loadRawConfig } from "docs-axi/lib/config";
import { repoConfigs, type RepoConfig } from "./planconfig.js";

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Spawn error code, e.g. ENOENT. */
  error?: string;
}

/** Runs a command with stdin from /dev/null. Injected so tests need no real binaries. */
export type Runner = (cmd: string, args: string[], opts: { cwd?: string }) => RunResult;

export const defaultRunner: Runner = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, { ...(opts.cwd ? { cwd: opts.cwd } : {}), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", ...(code ? { error: code } : {}) };
};

export interface HostEnv {
  /** process.platform value. */
  platform: NodeJS.Platform | string;
  env: Record<string, string | undefined>;
  home: string;
  run: Runner;
}

export function defaultHost(): HostEnv {
  return { platform: process.platform, env: process.env, home: homedir(), run: defaultRunner };
}

export type HostKind = "wsl" | "windows" | "other";

export function detectHost(h: Pick<HostEnv, "platform" | "env">): HostKind {
  if (h.platform === "win32") return "windows";
  if (h.platform === "linux" && (h.env["WSL_DISTRO_NAME"] || h.env["WSL_INTEROP"])) return "wsl";
  return "other";
}

export interface RepoRuntime {
  name: string;
  /** Path usable by this process (WSL path for a Windows repo under WSL). */
  path: string;
  /** Path as the repo's own tools see it (Windows path for a Windows repo under WSL). */
  nativePath: string;
  /** True when git and treehouse run as Windows tools from WSL. */
  viaWindows: boolean;
  git(args: string[], opts?: { allowFail?: boolean; raw?: boolean }): string;
  treehouse(args: string[]): string;
  /** Path as the repo's tools see it: WSL -> Windows for a Windows repo under WSL, else unchanged. */
  toNative(p: string): string;
  /** Path as this process sees it: Windows -> WSL for a Windows repo under WSL, else unchanged. */
  toWsl(p: string): string;
}

const WIN_PATH = /[A-Za-z]:\\[^\s"'\]|]*/g;

function splitCmd(c: string): string[] {
  return c.trim().split(/\s+/);
}

function psQuote(a: string): string {
  return `'${a.replace(/'/g, "''")}'`;
}

function failure(tool: string, args: string[], r: RunResult, code: string): AxiError {
  if (r.error === "ENOENT") return new AxiError(`${tool} not found on PATH`, "NOT_FOUND", [`Install ${tool}, or set [repos.<name>] ${tool} to its command`]);
  const tail = r.stderr.trim().split("\n").filter((l) => l.trim()).slice(-3).join(" | ");
  return new AxiError(`${tool} ${args[0] ?? ""} failed: ${tail}`, code);
}

/** Convert a path with wslpath (-u: to WSL, -w: to Windows). Falls back to the input when wslpath fails. */
function wslpath(run: Runner, flag: "-u" | "-w", p: string): string {
  const r = run("wslpath", [flag, p], {});
  return r.status === 0 && r.stdout.trim() !== "" ? r.stdout.trim() : p;
}

/** Windows profile directory as a WSL path, via cmd.exe. */
function windowsHome(host: HostEnv): string {
  const r = host.run("cmd.exe", ["/c", "echo %USERPROFILE%"], {});
  const win = r.stdout.replace(/\r/g, "").trim().split("\n").pop()?.trim() ?? "";
  if (r.status !== 0 || win === "" || win.includes("%")) {
    throw new AxiError("could not read the Windows profile from cmd.exe", "VALIDATION_ERROR", ["Use an absolute path for the Windows repo in [repos.<name>] path"]);
  }
  return wslpath(host.run, "-u", win);
}

function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return `${home.replace(/[\\/]$/, "")}/${p.slice(2)}`;
  return p;
}

/**
 * Build the runtime for one repo. platform=windows applies only under WSL; elsewhere it is ignored.
 * Override commands (`git`, `treehouse`) win over the platform defaults and skip the pwsh wrapper.
 */
export function repoRuntime(cfg: RepoConfig, host: HostEnv = defaultHost()): RepoRuntime {
  const kind = detectHost(host);
  const viaWindows = kind === "wsl" && cfg.platform === "windows";
  const home = viaWindows ? windowsHome(host) : host.home;
  let path = expandHome(cfg.path, home);
  if (viaWindows && /^[A-Za-z]:[\\/]/.test(path)) path = wslpath(host.run, "-u", path);
  const toNative = (p: string): string => (viaWindows ? wslpath(host.run, "-w", p) : p);
  const toWsl = (p: string): string => (viaWindows && /^[A-Za-z]:[\\/]/.test(p) ? wslpath(host.run, "-u", p) : p);
  const nativePath = toNative(path);

  const gitCmd = cfg.git ? splitCmd(cfg.git) : [viaWindows ? "git.exe" : "git"];
  const thCmd = cfg.treehouse ? splitCmd(cfg.treehouse) : undefined;

  return {
    name: cfg.name,
    path,
    nativePath,
    viaWindows,
    toNative,
    toWsl,
    git(args, opts = {}) {
      const r = host.run(gitCmd[0] as string, [...gitCmd.slice(1), ...args], { cwd: path });
      if (r.status !== 0) {
        if (opts.allowFail) return "";
        throw failure("git", args, r, "GIT_ERROR");
      }
      return opts.raw ? r.stdout : r.stdout.trim();
    },
    treehouse(args) {
      let r: RunResult;
      if (thCmd) r = host.run(thCmd[0] as string, [...thCmd.slice(1), ...args], { cwd: path });
      else if (viaWindows) r = host.run("pwsh.exe", ["-NoProfile", "-NonInteractive", "-Command", `& treehouse ${args.map(psQuote).join(" ")}`], { cwd: path });
      else r = host.run(host.platform === "win32" ? "treehouse.exe" : "treehouse", args, { cwd: path });
      if (r.status !== 0) throw failure("treehouse", args, r, "TREEHOUSE_ERROR");
      const out = r.stdout.replace(/\r\n/g, "\n").trim();
      return viaWindows ? out.replace(WIN_PATH, (m) => wslpath(host.run, "-u", m)) : out;
    },
  };
}

/** Runtimes for every configured repo, keyed by name. */
export function loadRepoRuntimes(root: string, host: HostEnv = defaultHost()): Map<string, RepoRuntime> {
  const out = new Map<string, RepoRuntime>();
  for (const cfg of repoConfigs(loadRawConfig(root))) out.set(cfg.name, repoRuntime(cfg, host));
  return out;
}
