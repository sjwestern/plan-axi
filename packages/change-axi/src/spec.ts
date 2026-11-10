import { loadRawConfig, type Layout } from "docs-axi/lib/config";

export interface SectionSpec {
  name: string;
  guide: string;
}

export const PROPOSAL_SECTIONS: SectionSpec[] = [
  { name: "Why", guide: "The problem or goal, and who it matters to. 2-5 sentences." },
  { name: "Context", guide: 'Docs read for this plan (paths from docs-axi) and ADRs that apply by number. Refer to other changes as change:<slug>, never by path. "no relevant docs found" if the area is undocumented.' },
  { name: "What changes", guide: "Observable behavior or structure after this change. Concrete bullets." },
  { name: "Out of scope", guide: "What this change deliberately does not do." },
  { name: "Approach", guide: "How it will be built, at a level a reviewer can judge. Key components and boundaries. Alternatives considered, one line each. Real decisions become ADRs." },
  { name: "Steps", guide: "One line per step file in reading order: `NN-name.md` - what it delivers. Dependencies live in tasks.md, not here." },
  { name: "Acceptance", guide: "How the whole change is verified: commands to run, behavior to observe. Checkable." },
  { name: "Docs impact", guide: "Every doc created or changed, one line each: `docs/domain/x.md` - update: what. Or `None - <reason>`." },
  { name: "Risks and open questions", guide: "Bullets, or `None`." },
];

export function proposalSections(layout: Layout): SectionSpec[] {
  const section = layout.sections[0]?.name ?? "<section>";
  return PROPOSAL_SECTIONS.map((item) =>
    item.name === "Docs impact"
      ? { ...item, guide: `Every doc created or changed, one line each: \`${layout.dir}/${section}/x.md\` - update: what. Or \`None - <reason>\`.` }
      : item,
  );
}

export const STEP_SECTIONS: SectionSpec[] = [
  { name: "Goal", guide: "One or two sentences: the outcome of this step on its own." },
  { name: "Context", guide: "What the implementer needs that is not obvious from the code: constraints, ADR numbers, interfaces other steps rely on." },
  { name: "Work", guide: "Concrete changes in order. Name files, types, endpoints. No placeholders." },
  { name: "Done when", guide: "Checkable local proof: tests that pass, commands and expected output. The step is committed only when this holds." },
];

export const PROPOSAL_HEADER_LINES: SectionSpec[] = [
  { name: "Repos", guide: "Optional: other repos this change edits, comma separated `name@base` (base branch; omit `@base` for the repo default). Names come from `[repos.<name>]` in .plan-axi.toml. The plan repo is implicit. Step Owns use `<repo>:<path>` for these repos." },
];

export const STEP_HEADER_LINES: SectionSpec[] = [
  { name: "Owns", guide: "Comma separated repo-relative paths or globs the step EDITS (write set for parallel overlap checks). Paths in another repo use `<repo>:<path>`, and the repo must be listed in the proposal `Repos:` header. Read-only context goes in Docs." },
  { name: "Docs", guide: "Docs to read before starting, comma separated paths, or `none`." },
  { name: "Tier", guide: "Optional: `small`, `standard` or `deep`. Picks the agent profile for the step through `[apply.tiers]`. Omit for no tier." },
];

export const TIERS = ["small", "standard", "deep"] as const;

/** Profile name mapped to `tier` by `[apply.tiers] <tier> = "<profile>"`, if any. */
export function tierProfile(root: string, tier: string): string | undefined {
  const v = loadRawConfig(root)[`apply.tiers.${tier}`];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** True when any `[apply.tiers]` key is configured. */
export function tiersConfigured(root: string): boolean {
  return Object.keys(loadRawConfig(root)).some((k) => k.startsWith("apply.tiers."));
}

export function proposalSkeleton(title: string): string {
  return `# ${title}\n\n${PROPOSAL_SECTIONS.map((s) => `## ${s.name}\n`).join("\n")}`;
}

export function stepSkeleton(num: string, title: string, owns: string[], docs: string[], tier?: string): string {
  return (
    `# ${num} - ${title}\n\nOwns: ${owns.join(", ")}\nDocs: ${docs.length > 0 ? docs.join(", ") : "none"}\n${tier ? `Tier: ${tier}\n` : ""}\n` +
    STEP_SECTIONS.map((s) => `## ${s.name}\n`).join("\n")
  );
}
