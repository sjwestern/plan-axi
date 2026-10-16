import { isAbsolute, resolve } from "node:path";
import { runAxiCli } from "axi-sdk-js";
import type { AxiRenderable } from "./types.js";
import { findRepoRoot } from "./fsutil.js";
import type { Ctx } from "./model.js";
import { loadConfig } from "./config.js";
import { checkCommand, CHECK_SPEC } from "./commands/check.js";
import {
  LIST_SPEC,
  SEARCH_SPEC,
  SHOW_SPEC,
  homeCommand,
  listCommand,
  searchCommand,
  showCommand,
} from "./commands/read.js";
import {
  ADR_SPEC,
  INDEX_SPEC,
  INIT_SPEC,
  NEW_SPEC,
  SUPERSEDE_SPEC,
  UPDATE_SPEC,
  adrCommand,
  indexCommand,
  initCommand,
  newCommand,
  supersedeCommand,
  updateCommand,
} from "./commands/write.js";
import {
  APPEND_SPEC,
  SECTIONS_SPEC,
  WRITE_SPEC,
  appendCommand,
  sectionsCommand,
  writeCommand,
} from "./commands/sections.js";
import { MIGRATE_SPEC, migrateCommand } from "./commands/migrate.js";
import { VERSION } from "./version.js";

export const DESCRIPTION =
  "Manage the repo docs folder (domain, architecture, decisions) with a generated index. Prefer this over hand-editing docs/README.md or ADR numbers.";

export const TOP_HELP = `usage: docs-axi [command] [args] [flags]
commands[14]:
  (none)=docs map, init, list, search, show, sections, write, append, new, adr, update, supersede, index, check, migrate
flags[2]:
  --docs <dir> (after command; default <repo>/docs), --help, -v/-V/--version
examples:
  docs-axi
  docs-axi search billing invoice
  docs-axi show domain/billing --section Refunds
  docs-axi write domain/billing --section Refunds --body "..."
  docs-axi new domain "Billing rules" --summary "Invoice, proration and refund rules"
  docs-axi adr "Use Postgres for jobs" --summary "Why jobs live in Postgres, not Redis"
  docs-axi update 7 --status accepted
  docs-axi check
`;

type Handler = (ctx: Ctx, args: string[]) => AxiRenderable;

const COMMANDS: Record<string, { run: Handler; help: string }> = {
  init: { run: initCommand, help: INIT_SPEC.help },
  list: { run: listCommand, help: LIST_SPEC.help },
  search: { run: searchCommand, help: SEARCH_SPEC.help },
  show: { run: showCommand, help: SHOW_SPEC.help },
  new: { run: newCommand, help: NEW_SPEC.help },
  adr: { run: adrCommand, help: ADR_SPEC.help },
  update: { run: updateCommand, help: UPDATE_SPEC.help },
  supersede: { run: supersedeCommand, help: SUPERSEDE_SPEC.help },
  index: { run: indexCommand, help: INDEX_SPEC.help },
  check: { run: checkCommand, help: CHECK_SPEC.help },
  migrate: { run: migrateCommand, help: MIGRATE_SPEC.help },
  sections: { run: sectionsCommand, help: SECTIONS_SPEC.help },
  write: { run: writeCommand, help: WRITE_SPEC.help },
  append: { run: appendCommand, help: APPEND_SPEC.help },
};

function docsFlag(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--docs") return args[i + 1];
    if (a.startsWith("--docs=")) return a.slice("--docs=".length);
  }
  return undefined;
}

export interface MainOptions {
  argv?: string[];
  cwd?: string;
  stdout?: { write: (chunk: string) => unknown };
}

export async function main(options: MainOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const resolveCtx = (args: string[]): Ctx => {
    const root = findRepoRoot(cwd);
    const flag = docsFlag(args);
    const docsDir = flag === undefined ? resolve(root, "docs") : isAbsolute(flag) ? flag : resolve(cwd, flag);
    return { root, docsDir, config: loadConfig(root) };
  };
  const commands: Record<string, (args: string[], ctx: Ctx | undefined) => AxiRenderable> = {};
  for (const [name, c] of Object.entries(COMMANDS)) {
    commands[name] = (args, ctx) => c.run(ctx as Ctx, args);
  }
  await runAxiCli<Ctx>({
    ...(options.argv ? { argv: options.argv } : {}),
    ...(options.stdout ? { stdout: options.stdout } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    commands,
    home: (_args, ctx) => homeCommand(ctx as Ctx),
    getCommandHelp: (command) => COMMANDS[command]?.help,
    resolveContext: ({ args }) => resolveCtx(args),
  });
}
