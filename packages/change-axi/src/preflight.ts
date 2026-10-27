import { checkProfile, defaultCheckDeps, type AgentChoice, type CheckDeps, type CheckResult } from "./agent.js";

/** Live check of the profile an agent choice resolved to. Non-profile choices (plain templates) have nothing to check. */
export function preflightProfile(choice: AgentChoice, deps: CheckDeps = defaultCheckDeps): CheckResult[] {
  if (!choice.profile) return [];
  return checkProfile(choice.profile, deps);
}
