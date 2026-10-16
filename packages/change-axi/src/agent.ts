import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { loadRawConfig } from "docs-axi/lib/config";

/** Built-in agent binary -> command template. Only pi is verified; the rest are best-effort and overridable. */
export const AGENT_TABLE: [string, string][] = [
  ["pi", "pi {prompt}"],
  ["claude", "claude {prompt}"],
  ["codex", "codex {prompt}"],
  ["gemini", "gemini -i {prompt}"],
  ["opencode", "opencode --prompt {prompt}"],
];

export interface AgentChoice {
  template: string;
  source: "repo/user config" | "CHANGE_AXI_AGENT" | "autodetect";
}

function onPath(bin: string): boolean {
  const exts = process.platform === "win32" ? (process.env["PATHEXT"] ?? ".EXE;.CMD;.BAT").split(";").concat("") : [""];
  return (process.env["PATH"] ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((d) => exts.some((x) => existsSync(join(d, bin + x))));
}

/** Config (`[apply] agent`, repo over user), then env CHANGE_AXI_AGENT, then PATH autodetect. */
export function resolveAgent(root: string): AgentChoice | undefined {
  const cfg = loadRawConfig(root)["apply.agent"];
  if (typeof cfg === "string" && cfg.trim() !== "") return { template: cfg.trim(), source: "repo/user config" };
  const env = process.env["CHANGE_AXI_AGENT"];
  if (env && env.trim() !== "") return { template: env.trim(), source: "CHANGE_AXI_AGENT" };
  const hit = AGENT_TABLE.find(([bin]) => onPath(bin));
  return hit ? { template: hit[1], source: "autodetect" } : undefined;
}

export function shellQuote(s: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return `"${s.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface CommandVars {
  prompt: string;
  slug: string;
  step?: string;
  path: string;
}

/** Fill `{prompt}`, `{slug}`, `{step}`, `{path}` with shell-quoted values (unknown placeholders stay). */
export function buildCommand(template: string, v: CommandVars, platform: NodeJS.Platform = process.platform): string {
  const vals: Record<string, string> = { prompt: v.prompt, slug: v.slug, step: v.step ?? "", path: v.path };
  return template.replace(/\{(prompt|slug|step|path)\}/g, (_m, k: string) => shellQuote(vals[k] as string, platform));
}

/** Run the command in `cwd` with inherited stdio. Returns the exit code. */
export function runAgent(command: string, cwd: string): number {
  const r = spawnSync(command, { cwd, stdio: "inherit", shell: true });
  return r.status ?? 1;
}
