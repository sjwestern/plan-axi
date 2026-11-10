import { AxiError } from "axi-sdk-js";
import { loadRawConfig, parseToml, type Value } from "docs-axi/lib/config";
import { checkProfile, defaultCheckDeps, loadProfiles, type AgentProfile, type CheckDeps, type CheckResult } from "./agent.js";
import { checkFile, checkMerged, REPO_PLATFORMS } from "./configcheck.js";
import { commitStyle, type CommitStyle } from "./commitstyle.js";
import { loadGuidance, type Guidance } from "./guidance.js";
import { TIERS, tierProfile } from "./spec.js";

export type Tier = (typeof TIERS)[number];

export interface ResolvedTier {
  tier: Tier;
  profile?: string;
  model?: string;
  effort?: string;
}

export interface PlanConfig {
  profiles: AgentProfile[];
  tiers: Partial<Record<Tier, string>>;
  rules: Guidance["tiers"];
  default_tier?: string;
  agent?: string;
  commit: CommitStyle;
  resolved: ResolvedTier[];
}

export { REPO_PLATFORMS };

export interface RepoConfig {
  name: string;
  path: string;
  /** "windows": a Windows checkout reached from WSL (ignored outside WSL). Default "native". */
  platform: (typeof REPO_PLATFORMS)[number];
  /** Override command for git (whitespace-split). */
  git?: string;
  /** Override command for treehouse (whitespace-split). */
  treehouse?: string;
}

/** `[repos.<name>]` tables from a raw config map. Entries without a string path are skipped (see planConfigProblems). */
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
    out.push({ name, path, platform, ...(git ? { git } : {}), ...(treehouse ? { treehouse } : {}) });
  }
  return out;
}

/** Merged user+repo `[repos.*]` config (repo file overrides user file per key). */
export function readRepoConfigs(root: string): RepoConfig[] {
  return repoConfigs(loadRawConfig(root));
}

/** Merged user+repo plan config as one read model. */
export function readPlanConfig(root: string): PlanConfig {
  const profiles = loadProfiles(root);
  const guidance = loadGuidance(root);
  const tiers: PlanConfig["tiers"] = {};
  const resolved: ResolvedTier[] = [];
  for (const tier of TIERS) {
    const name = tierProfile(root, tier);
    if (name !== undefined) tiers[tier] = name;
    const entry: ResolvedTier = { tier };
    const p = name === undefined ? undefined : profiles.find((x) => x.name === name);
    if (p) {
      entry.profile = p.name;
      if (p.model) entry.model = p.model;
      if (p.effort) entry.effort = p.effort;
    }
    resolved.push(entry);
  }
  const agent = loadRawConfig(root)["apply.agent"];
  const cfg: PlanConfig = { profiles, tiers, rules: guidance.tiers, commit: commitStyle(root), resolved };
  if (guidance.default_tier) cfg.default_tier = guidance.default_tier;
  if (typeof agent === "string" && agent.trim() !== "") cfg.agent = agent.trim();
  return cfg;
}

/** Structural errors in a raw config map, as messages (warnings omitted; no live checks). */
export function planConfigProblems(raw: Record<string, Value>): string[] {
  const files = [{ file: ".plan-axi.toml", raw }];
  return [...checkFile(files[0]!.file, raw), ...checkMerged(files)].filter((p) => p.severity === "error").map((p) => p.message);
}

/** Throws VALIDATION_ERROR when candidate config text has structural problems. */
export function validatePlanConfig(candidateText: string): void {
  const problems = planConfigProblems(parseToml(candidateText, ".plan-axi.toml"));
  if (problems.length > 0) {
    throw new AxiError(problems.join("; "), "VALIDATION_ERROR", problems.map((p) => `Fix: ${p}`));
  }
}

export interface ProfileVerification {
  profile: string;
  results: CheckResult[];
}

/** Live harness checks for the named profiles (all when omitted). Unknown names throw VALIDATION_ERROR. */
export function verifyProfiles(root: string, names?: string[], deps: CheckDeps = defaultCheckDeps): ProfileVerification[] {
  const profiles = loadProfiles(root);
  const picked = names === undefined ? profiles : names.map((n) => {
    const hit = profiles.find((p) => p.name === n);
    if (!hit) throw new AxiError(`unknown agent profile "${n}"`, "VALIDATION_ERROR", [`Defined profiles: ${profiles.map((p) => p.name).join(", ") || "none"}`]);
    return hit;
  });
  return picked.map((p) => ({ profile: p.name, results: checkProfile(p, deps) }));
}
