import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "docs-axi/lib/types";
import { parseArgs, type CmdSpec } from "docs-axi/lib/args";
import { resolveChange, type Ctx } from "./change.js";

export const WHERE_SPEC: CmdSpec = {
  name: "where",
  flags: {},
  min: 1,
  max: 1,
  usage: "change-axi where <slug>",
  help: `usage: change-axi where <slug>
Print where a change lives and its state: active, archived or backlog (only in backlog.md, no plan files).
Refer to changes by slug (\`change:<slug>\`), not by path; archive moves them.
`,
};

export function whereCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(WHERE_SPEC, args);
  const slug = p.pos[0] as string;
  const r = resolveChange(ctx, slug);
  if (!r) throw new AxiError(`change "${slug}" not found in active, archived or backlog`, "NOT_FOUND");
  return r.rel ? { change: slug, state: r.state, path: r.rel } : { change: slug, state: r.state };
}
