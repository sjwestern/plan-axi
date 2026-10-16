export interface SectionSpec {
  name: string;
  guide: string;
}

export const PROPOSAL_SECTIONS: SectionSpec[] = [
  { name: "Why", guide: "The problem or goal, and who it matters to. 2-5 sentences." },
  { name: "Context", guide: 'Docs read for this plan (paths from docs-axi) and ADRs that apply by number. "no relevant docs found" if the area is undocumented.' },
  { name: "What changes", guide: "Observable behavior or structure after this change. Concrete bullets." },
  { name: "Out of scope", guide: "What this change deliberately does not do." },
  { name: "Approach", guide: "How it will be built, at a level a reviewer can judge. Key components and boundaries. Alternatives considered, one line each. Real decisions become ADRs." },
  { name: "Steps", guide: "One line per step file in reading order: `NN-name.md` - what it delivers. Dependencies live in tasks.md, not here." },
  { name: "Acceptance", guide: "How the whole change is verified: commands to run, behavior to observe. Checkable." },
  { name: "Docs impact", guide: "Every doc created or changed, one line each: `docs/domain/x.md` - update: what. Or `None - <reason>`." },
  { name: "Risks and open questions", guide: "Bullets, or `None`." },
];

export const STEP_SECTIONS: SectionSpec[] = [
  { name: "Goal", guide: "One or two sentences: the outcome of this step on its own." },
  { name: "Context", guide: "What the implementer needs that is not obvious from the code: constraints, ADR numbers, interfaces other steps rely on." },
  { name: "Work", guide: "Concrete changes in order. Name files, types, endpoints. No placeholders." },
  { name: "Done when", guide: "Checkable local proof: tests that pass, commands and expected output. The step is committed only when this holds." },
];

export const STEP_HEADER_LINES: SectionSpec[] = [
  { name: "Owns", guide: "Comma separated repo-relative paths or globs the step EDITS (write set for parallel overlap checks). Read-only context goes in Docs." },
  { name: "Docs", guide: "Docs to read before starting, comma separated paths, or `none`." },
];

export function proposalSkeleton(title: string): string {
  return `# ${title}\n\n${PROPOSAL_SECTIONS.map((s) => `## ${s.name}\n`).join("\n")}`;
}

export function stepSkeleton(num: string, title: string, owns: string[], docs: string[]): string {
  return (
    `# ${num} - ${title}\n\nOwns: ${owns.join(", ")}\nDocs: ${docs.length > 0 ? docs.join(", ") : "none"}\n\n` +
    STEP_SECTIONS.map((s) => `## ${s.name}\n`).join("\n")
  );
}
