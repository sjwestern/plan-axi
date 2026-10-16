import { isAbsolute, resolve } from "node:path";
import { runAxiCli } from "axi-sdk-js";
import { findRepoRoot } from "docs-axi/lib/fsutil";
import type { AxiRenderable } from "docs-axi/lib/types";
import * as c from "./commands.js";
import type { Ctx } from "./change.js";
import { VERSION } from "./version.js";

export const DESCRIPTION =
  "Manage change plans under specs/changes: scaffold proposal and steps, write sections, check the task graph. Prefer this over hand-creating plan files or editing tasks.md.";

export const TOP_HELP = `usage: change-axi [command] [args] [flags]
commands[16]:
  (none)=active changes, spec, new, step, dep, sections, show, write, append, check, status, claim, start, archive, enter, setup
flags[2]:
  --root <dir> (after command; default git root), --help, -v/-V/--version
examples:
  change-axi spec proposal
  change-axi new split-auth "Split the auth module"
  change-axi write split-auth proposal --section Why --body "Slow builds."
  change-axi step add split-auth "Extract token store" --owns src/auth/ --after 01-schema
  change-axi check split-auth --waves
`;

type Handler = (ctx: Ctx, args: string[]) => AxiRenderable;
const COMMANDS: Record<string, { run: Handler; help: string }> = {
  spec: { run: c.specCommand, help: c.SPEC_SPEC.help },
  new: { run: c.newCommand, help: c.NEW_SPEC.help },
  step: { run: c.stepCommand, help: c.STEP_SPEC.help },
  dep: { run: c.depCommand, help: c.DEP_SPEC.help },
  sections: { run: c.sectionsCommand, help: c.SECTIONS_SPEC.help },
  show: { run: c.showCommand, help: c.SHOW_SPEC.help },
  write: { run: c.writeCommand, help: c.WRITE_SPEC.help },
  append: { run: c.appendCommand, help: c.APPEND_SPEC.help },
  check: { run: c.checkCommand, help: c.CHECK_SPEC.help },
  start: { run: c.startCommand, help: c.START_SPEC.help },
  claim: { run: c.claimCommand, help: c.CLAIM_SPEC.help },
  archive: { run: c.archiveCommand, help: c.ARCHIVE_SPEC.help },
  enter: { run: c.enterCommand, help: c.ENTER_SPEC.help },
  setup: { run: c.setupCommand, help: c.SETUP_SPEC.help },
  status: { run: c.statusCommand, help: c.STATUS_SPEC.help },
};

export interface MainOptions {
  argv?: string[];
  cwd?: string;
  stdout?: { write: (chunk: string) => unknown };
}

function rootFlag(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--root") return args[i + 1];
    if (a.startsWith("--root=")) return a.slice(7);
  }
  return undefined;
}

export async function main(options: MainOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const resolveCtx = (args: string[]): Ctx => {
    const flag = rootFlag(args);
    return { root: flag === undefined ? findRepoRoot(cwd) : isAbsolute(flag) ? flag : resolve(cwd, flag) };
  };
  const commands: Record<string, (args: string[], ctx: Ctx | undefined) => AxiRenderable> = {};
  for (const [name, cmd] of Object.entries(COMMANDS)) commands[name] = (args, ctx) => cmd.run(ctx as Ctx, stripRoot(args));
  await runAxiCli<Ctx>({
    ...(options.argv ? { argv: options.argv } : {}),
    ...(options.stdout ? { stdout: options.stdout } : {}),
    description: DESCRIPTION,
    version: VERSION,
    topLevelHelp: TOP_HELP,
    commands,
    home: (_args, ctx) => c.homeCommand(ctx as Ctx),
    getCommandHelp: (command) => COMMANDS[command]?.help,
    resolveContext: ({ args }) => resolveCtx(args),
  });
}

function stripRoot(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--root") i++;
    else if (!a.startsWith("--root=")) out.push(a);
  }
  return out;
}
