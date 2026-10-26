import { AxiError } from "axi-sdk-js";
import { loadRawConfig, parseToml, type Value } from "docs-axi/lib/config";
import { checkProfile, defaultCheckDeps, loadProfiles, type AgentProfile, type CheckDeps, type CheckResult } from "./agent.js";
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

/** Structural problems in a raw config map (no live checks). */
export function planConfigProblems(raw: Record<string, Value>): string[] {
  const problems: string[] = [];
  const profilePrefix = "apply.agents.";
  const names = new Set<string>();
  const known = new Map<string, Set<string>>();
  for (const k of Object.keys(raw)) {
    if (!k.startsWith(profilePrefix)) continue;
    const rest = k.slice(profilePrefix.length);
    const i = rest.lastIndexOf(".");
    if (i <= 0) continue;
    const name = rest.slice(0, i);
    names.add(name);
    if (!known.has(name)) known.set(name, new Set());
    known.get(name)!.add(rest.slice(i + 1));
  }
  const nonEmpty = (k: string): boolean => typeof raw[k] === "string" && (raw[k] as string).trim() !== "";
  for (const name of names) {
    if (!nonEmpty(`${profilePrefix}${name}.harness`) && !nonEmpty(`${profilePrefix}${name}.command`)) {
      problems.push(`agent profile "${name}" needs harness or command`);
    }
  }
  for (const k of Object.keys(raw)) {
    if (!k.startsWith("apply.tiers.")) continue;
    const tier = k.slice("apply.tiers.".length);
    if (!(TIERS as readonly string[]).includes(tier)) {
      problems.push(`unknown tier "${tier}" in [apply.tiers]; valid tiers: ${TIERS.join(", ")}`);
      continue;
    }
    const v = raw[k];
    if (typeof v !== "string" || v.trim() === "") problems.push(`tier "${tier}" must map to a profile name`);
    else if (!names.has(v.trim())) problems.push(`tier "${tier}" maps to undefined profile "${v.trim()}"`);
  }
  const d = raw["propose.default_tier"];
  if (d !== undefined && (typeof d !== "string" || !(TIERS as readonly string[]).includes(d.trim()))) {
    problems.push(`default_tier ${JSON.stringify(d)} is not valid; use one of: ${TIERS.join(", ")}`);
  }
  return problems;
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
