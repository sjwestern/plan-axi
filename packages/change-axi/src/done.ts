import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { headerLine, readLf, requireChange, splitList, tasksRel, type Ctx } from "./change.js";
import { git } from "./git.js";
import { listTasks, runTasks } from "./tasks.js";

export interface DoneResult {
  step: string;
  commit: string;
  warnings: string[];
}

const root = (s: string): string => s.replace(/[*?[{].*$/, "").replace(/\/+$/, "");
const inOwns = (path: string, owns: string[]): boolean => owns.some((o) => {
  const r = root(o);
  return r === "" || path === r || path.startsWith(`${r}/`);
});

/** Mark a started step done and commit only tasks.md. Warns on paths changed outside Owns. */
export function done(ctx: Ctx, slug: string, stepArg: string, since?: string): DoneResult {
  const dir = requireChange(ctx, slug);
  const file = tasksRel(slug);
  const tasks = listTasks(ctx.root, file);
  const hit = tasks.find((t) => t.id === stepArg) ?? tasks.filter((t) => t.id.startsWith(`${stepArg}-`)).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!hit) throw new AxiError(`no step "${stepArg}"`, "NOT_FOUND", [`Steps: ${tasks.map((t) => t.id).join(", ")}`]);
  if (hit.state === "done") throw new AxiError(`${hit.id} is already done`, "VALIDATION_ERROR");
  if (hit.state !== "in_flight") throw new AxiError(`${hit.id} is not started`, "VALIDATION_ERROR", [`Run \`change-axi claim ${slug} ${hit.id}\` first`]);
  const owns = splitList(headerLine(readLf(join(dir, `${hit.id}.md`)), "Owns"));
  const base = since ?? git(ctx, ["log", "-1", "--format=%H", "--", file], true);
  const changed = base ? git(ctx, ["diff", "--name-only", `${base}..HEAD`], true).split("\n").filter(Boolean) : [];
  const planDir = `specs/changes/active/${slug}/`;
  const outside = changed.filter((p) => !p.startsWith(planDir) && !inOwns(p, owns));
  runTasks(ctx.root, ["done", hit.id, "--file", file]);
  git(ctx, ["add", "--", file]);
  git(ctx, ["commit", "-q", "-m", `${slug}: done ${hit.id}`, "--", file]);
  const warnings = outside.length > 0 ? [`OUTSIDE_OWNS: ${outside.join(", ")} changed since ${base.slice(0, 7)} but not in Owns of ${hit.id}`] : [];
  return { step: hit.id, commit: git(ctx, ["rev-parse", "--short", "HEAD"]), warnings };
}
