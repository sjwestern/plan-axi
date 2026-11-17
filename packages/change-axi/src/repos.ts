import { AxiError } from "axi-sdk-js";
import { loadRawConfig } from "docs-axi/lib/config";
import {
  defaultHost,
  repoConfigs,
  resolveRepoPath,
  wslpath,
  type HostEnv,
  type RepoConfig,
  type RunResult,
  type Runner,
} from "docs-axi/lib/repohost";

export { defaultHost, defaultRunner, detectHost } from "docs-axi/lib/repohost";
export type { HostEnv, HostKind, RunResult, Runner } from "docs-axi/lib/repohost";

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

/**
 * Build the runtime for one repo. platform=windows applies only under WSL; elsewhere it is ignored.
 * Override commands (`git`, `treehouse`) win over the platform defaults and skip the pwsh wrapper.
 */
export function repoRuntime(cfg: RepoConfig, host: HostEnv = defaultHost()): RepoRuntime {
  const { path, viaWindows } = resolveRepoPath(cfg, host);
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
