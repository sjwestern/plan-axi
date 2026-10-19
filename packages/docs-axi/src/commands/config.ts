import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { loadConfig } from "../config.js";
import type { Ctx } from "../model.js";
import { parseGuide, writeLayoutConfig, type LayoutChanges } from "../configwrite.js";

export const CONFIG_HELP = `usage: docs-axi config [--dir <path>] [--sections a,b,c] [--adr <name>|none] [--guide name="text"]...
Show the effective docs layout, or update the repo .plan-axi.toml layout.

flags:
  --dir <path>           docs folder (default docs)
  --sections <a,b,c>     ordered section names
  --adr <name|none>      section for ADRs, or disable ADRs
  --guide name="text"    section guide (repeatable)
`;

function splitSections(value: string): string[] {
  const sections = value.split(",").map((part) => part.trim());
  if (sections.some((section) => section === "")) {
    throw new AxiError("--sections needs a comma-separated list of names", "VALIDATION_ERROR");
  }
  return sections;
}

function parseChanges(args: string[]): LayoutChanges {
  const changes: LayoutChanges = {};
  const guides: NonNullable<LayoutChanges["guides"]> = [];
  let hasOptions = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--docs") {
      if (args[i + 1] === undefined) throw new AxiError("--docs requires a value", "VALIDATION_ERROR");
      i++;
      continue;
    }
    if (arg.startsWith("--docs=")) continue;
    if (!arg.startsWith("--")) throw new AxiError(`unexpected argument ${arg}`, "VALIDATION_ERROR");
    const eq = arg.indexOf("=");
    const name = eq < 0 ? arg : arg.slice(0, eq);
    const inline = eq < 0 ? undefined : arg.slice(eq + 1);
    const next = (): string => {
      const value = inline ?? args[++i];
      if (value === undefined || (inline === undefined && value.startsWith("--"))) {
        throw new AxiError(`${name} requires a value`, "VALIDATION_ERROR");
      }
      return value;
    };
    hasOptions = true;
    if (name === "--dir") changes.dir = next();
    else if (name === "--sections") changes.sections = splitSections(next());
    else if (name === "--adr") {
      const value = next();
      changes.adr = value === "none" ? null : value;
    } else if (name === "--guide") guides.push(parseGuide(next()));
    else throw new AxiError(`unknown flag ${name} for \`config\``, "VALIDATION_ERROR", [
      "valid flags: --dir, --sections, --adr, --guide",
    ]);
  }
  if (!hasOptions) return changes;
  changes.guides = guides;
  return changes;
}

export function configCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const changes = parseChanges(args);
  const writing = Object.keys(changes).length > 0;
  if (writing) writeLayoutConfig(ctx.root, changes);
  const config = loadConfig(ctx.root);
  const { layout } = config;
  return {
    docs_dir: layout.dir,
    sections: layout.sections.map((section) => ({ name: section.name, guide: section.guide, type: section.kind })),
    sources: config.sources.length === 0 ? "default" : config.sources.join("+"),
    ...(writing ? { follow_up: "Run docs-axi migrate when docs exist outside the new sections." } : {}),
  };
}
