import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { splitDoc } from "docs-axi/lib/sectionedit";
import { findSectionOrUndefined, sectionText } from "docs-axi/lib/sections";
import { headerLine, readLf, requireChange, tasksRel, type Ctx } from "./change.js";
import { listTasks, runTasks } from "./tasks.js";

export interface ClaimResult {
  step: string;
  already: boolean;
  owns: string;
  docs: string;
  sections: Record<string, string>;
}

const SECTION_KEYS: [string, string][] = [
  ["Goal", "goal"],
  ["Context", "context"],
  ["Work", "work"],
  ["Done when", "done_when"],
];

/** Start a step (or the first ready one) and return what is needed to implement it. */
export function claim(ctx: Ctx, slug: string, stepArg?: string): ClaimResult {
  const dir = requireChange(ctx, slug);
  const file = tasksRel(slug);
  const tasks = listTasks(ctx.root, file);
  let id: string;
  if (stepArg === undefined) {
    const next = tasks.filter((t) => t.state === "queued" && t.blockers.length === 0).map((t) => t.id).sort()[0];
    if (!next) {
      const flying = tasks.filter((t) => t.state === "in_flight").map((t) => t.id);
      throw new AxiError("no ready step to claim", "NOT_FOUND", [flying.length ? `In flight: ${flying.join(", ")}` : "All steps are done or blocked"]);
    }
    id = next;
  } else {
    const hit = tasks.find((t) => t.id === stepArg) ?? tasks.filter((t) => t.id.startsWith(`${stepArg}-`)).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!hit) throw new AxiError(`no step "${stepArg}"`, "NOT_FOUND", [`Steps: ${tasks.map((t) => t.id).join(", ")}`]);
    id = hit.id;
  }
  const t = tasks.find((x) => x.id === id) as (typeof tasks)[number];
  if (t.state === "done") throw new AxiError(`${id} is already done`, "VALIDATION_ERROR", ["Starting a done task would reopen it"]);
  if (t.state === "queued" && t.blockers.length > 0) {
    throw new AxiError(`${id} is blocked by ${t.blockers.join(", ")}`, "VALIDATION_ERROR", [`Run \`change-axi status ${slug}\``]);
  }
  const already = t.state === "in_flight";
  if (!already) runTasks(ctx.root, ["start", id, "--file", file]);
  const raw = readLf(join(dir, `${id}.md`));
  const d = splitDoc(raw);
  const sections: Record<string, string> = {};
  for (const [name, key] of SECTION_KEYS) {
    const s = findSectionOrUndefined(d.secs.filter((x) => x.level === 2), name);
    const text = s ? sectionText(d.lines, s, true).trim() : "";
    if (text) sections[key] = text;
  }
  return { step: id, already, owns: headerLine(raw, "Owns") ?? "", docs: headerLine(raw, "Docs") ?? "", sections };
}
