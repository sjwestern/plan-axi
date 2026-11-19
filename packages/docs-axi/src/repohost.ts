/**
 * Repos named in `[repos.<name>]` of .plan-axi.toml: config parsing, where their checkout is (including a Windows
 * checkout reached from WSL) and their ADRs. Shared by docs-axi (read and check across repos) and change-axi.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { AxiError } from "axi-sdk-js";
import { adrInfos, type AdrInfo } from "./adrrefs.js";
import { loadConfig, loadRawConfig, type Value } from "./config.js";
import { loadDocs } from "./model.js";

export const REPO_PLATFORMS = ["windows", "native"] as const;

export interface RepoConfig {
  name: string;
  path: string;
  /** "windows": a Windows checkout reached from WSL (ignored outside WSL). Default "native". */
  platform: (typeof REPO_PLATFORMS)[number];
  /** Override command for git (whitespace-split). */
  git?: string;
  /** Override command for treehouse (whitespace-split). */
  treehouse?: string;
  /** Docs dir of this repo, relative to its path. Marks the repo as an ADR and docs source for plans and docs-axi. */
  docs?: string;
}

/** `[repos.<name>]` tables from a raw config map. Entries without a string path are skipped. */
export function repoConfigs(raw: Record<string, Value>): RepoConfig[] {
  const byName = new Map<string, Record<string, Value>>();
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("repos.")) continue;
    const rest = k.slice("repos.".length);
    const i = rest.lastIndexOf(".");
    if (i <= 0) continue;
    const name = rest.slice(0, i);
    if (!byName.has(name)) byName.set(name, {});
    byName.get(name)![rest.slice(i + 1)] = v;
  }
  const out: RepoConfig[] = [];
  for (const [name, f] of byName) {
    const str = (key: string): string | undefined => (typeof f[key] === "string" && (f[key] as string).trim() !== "" ? (f[key] as string).trim() : undefined);
    const path = str("path");
    if (path === undefined) continue;
    const platform = str("platform") === "windows" ? "windows" : "native";
    const git = str("git");
    const treehouse = str("treehouse");
    const docs = str("docs");
    out.push({ name, path, platform, ...(git ? { git } : {}), ...(treehouse ? { treehouse } : {}), ...(docs ? { docs } : {}) });
  }
  return out;
}

/** Merged user+repo `[repos.*]` config (repo file overrides user file per key). */
export function readRepoConfigs(root: string): RepoConfig[] {
  return repoConfigs(loadRawConfig(root));
}

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

/** Convert a path with wslpath (-u: to WSL, -w: to Windows). Falls back to the input when wslpath fails. */
export function wslpath(run: Runner, flag: "-u" | "-w", p: string): string {
  const r = run("wslpath", [flag, p], {});
  return r.status === 0 && r.stdout.trim() !== "" ? r.stdout.trim() : p;
}

/** Windows profile directory as a WSL path, via cmd.exe. */
export function windowsHome(host: HostEnv): string {
  const r = host.run("cmd.exe", ["/c", "echo %USERPROFILE%"], {});
  const win = r.stdout.replace(/\r/g, "").trim().split("\n").pop()?.trim() ?? "";
  if (r.status !== 0 || win === "" || win.includes("%")) {
    throw new AxiError("could not read the Windows profile from cmd.exe", "VALIDATION_ERROR", ["Use an absolute path for the Windows repo in [repos.<name>] path"]);
  }
  return wslpath(host.run, "-u", win);
}

export function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return `${home.replace(/[\\/]$/, "")}/${p.slice(2)}`;
  return p;
}

/**
 * Where a repo's main checkout is for this process: platform=windows applies only under WSL (the path is then relative to
 * the Windows profile and converted to a WSL path). `viaWindows` is true when the repo's tools run as Windows tools.
 */
export function resolveRepoPath(cfg: Pick<RepoConfig, "path" | "platform">, host: HostEnv = defaultHost()): { path: string; viaWindows: boolean } {
  const viaWindows = detectHost(host) === "wsl" && cfg.platform === "windows";
  const home = viaWindows ? windowsHome(host) : host.home;
  let path = expandHome(cfg.path, home);
  if (viaWindows && /^[A-Za-z]:[\\/]/.test(path)) path = wslpath(host.run, "-u", path);
  return { path, viaWindows };
}

export interface SourceRepo {
  name: string;
  /** Checkout as this process sees it. */
  root: string;
  /** Absolute docs dir inside it. */
  docsDir: string;
}

export interface SourceRepos {
  repos: SourceRepo[];
  /** Names of source repos whose checkout or docs dir could not be read. */
  unavailable: string[];
}

/** Repos that set `docs`, resolved to checkout and docs dir. The plan repo itself is skipped. A missing checkout is reported, never thrown. */
export function sourceRepos(planRoot: string, host: HostEnv = defaultHost()): SourceRepos {
  const out: SourceRepos = { repos: [], unavailable: [] };
  for (const cfg of readRepoConfigs(planRoot)) {
    if (cfg.docs === undefined) continue;
    try {
      const root = resolveRepoPath(cfg, host).path;
      if (resolve(root) === resolve(planRoot)) continue;
      const docsDir = resolve(root, cfg.docs);
      if (!existsSync(docsDir)) {
        out.unavailable.push(cfg.name);
        continue;
      }
      out.repos.push({ name: cfg.name, root, docsDir });
    } catch {
      out.unavailable.push(cfg.name);
    }
  }
  return out;
}

export interface SourceDocPaths {
  /** Source repo name -> doc paths (relative to that repo's docs dir, posix). */
  docs: Map<string, Set<string>>;
  /** Names of source repos whose checkout or docs dir could not be read. */
  unavailable: string[];
}

/** Doc paths of each source repo, loaded once per run to resolve `<repo>:<path>` links. */
export function loadSourceDocPaths(planRoot: string, host: HostEnv = defaultHost()): SourceDocPaths {
  const { repos, unavailable } = sourceRepos(planRoot, host);
  const out: SourceDocPaths = { docs: new Map(), unavailable: [...unavailable] };
  for (const r of repos) {
    try {
      const docs = loadDocs({ root: r.root, docsDir: r.docsDir, config: loadConfig(r.root) });
      out.docs.set(r.name, new Set(docs.map((d) => d.path)));
    } catch {
      out.unavailable.push(r.name);
    }
  }
  return out;
}

export interface SourceAdrs {
  /** ADRs of every available source repo, tagged with the repo name. */
  adrs: AdrInfo[];
  /** Names of source repos whose checkout or docs dir could not be read. */
  unavailable: string[];
}

/** ADRs of each source repo, read from its configured main checkout with that repo's own docs layout. */
export function loadSourceAdrs(planRoot: string, host: HostEnv = defaultHost()): SourceAdrs {
  const { repos, unavailable } = sourceRepos(planRoot, host);
  const out: SourceAdrs = { adrs: [], unavailable: [...unavailable] };
  for (const r of repos) {
    try {
      const docs = loadDocs({ root: r.root, docsDir: r.docsDir, config: loadConfig(r.root) });
      for (const a of adrInfos(docs)) out.adrs.push({ ...a, repo: r.name });
    } catch {
      out.unavailable.push(r.name);
    }
  }
  return out;
}
