import { loadRawConfig } from "docs-axi/lib/config";
import { TIERS } from "./spec.js";

export interface Guidance {
  default_tier?: string;
  tiers: Record<(typeof TIERS)[number], string[]>;
}

/** Plain-language tier rules from `[propose.tiers]` and `[propose] default_tier` (user and repo unioned). */
export function loadGuidance(root: string): Guidance {
  const raw = loadRawConfig(root);
  const tiers = { small: [], standard: [], deep: [] } as Guidance["tiers"];
  for (const t of TIERS) {
    const v = raw[`propose.tiers.${t}`];
    if (Array.isArray(v)) tiers[t] = v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim());
    else if (typeof v === "string" && v.trim() !== "") tiers[t] = [v.trim()];
  }
  const d = raw["propose.default_tier"];
  const g: Guidance = { tiers };
  if (typeof d === "string" && (TIERS as readonly string[]).includes(d.trim())) g.default_tier = d.trim();
  return g;
}
