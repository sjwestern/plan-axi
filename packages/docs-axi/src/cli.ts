import { isAbsolute, resolve } from "node:path";
import { basename } from "node:path";
import { AxiError, runAxiCli } from "axi-sdk-js";
import { sourceRepos } from "./repohost.js";
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
  INDEX_SPEC,
  INIT_SPEC,
  NEW_SPEC,
  SUPERSEDE_SPEC,
  UPDATE_SPEC,
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
import { CONFIG_HELP, configCommand } from "./commands/config.js";
import { ADR_HELP, adrCommand } from "./commands/adr.js";
import { VERSION } from "./version.js";

export const DESCRIPTION =
  "Manage the repo docs folder (domain, architecture, decisions) with a generated index. Prefer this over hand-editing docs/README.md or ADR numbers.";

export const TOP_HELP = `usage: docs-axi [command] [args] [flags]
commands[15]:
  (none)=docs map, init, list, search, show, sections, write, append, new, adr, update, supersede, index, check, migrate, config
flags[4]:
  --docs <dir> (after command; default <repo>/docs), --help, -v/-V/--version
  --repo <name> (read commands: list, search, show, sections, adr list|search; reads that repo's docs, a repo with a docs key in [repos.<name>] of .plan-axi.toml)
  --all-repos (list, search, adr list|search; runs the command in this repo and every such repo, one result per repo)
examples:
  docs-axi
  docs-axi search billing invoice
  docs-axi show domain/billing --section Refunds
  docs-axi write domain/billing --section Refunds --body "..."
  docs-axi new domain "Billing rules" --summary "Invoice, proration and refund rules"
  docs-axi adr list --status accepted
  docs-axi adr search cache --all
  docs-axi adr add "Use Postgres for jobs" --summary "Why jobs live in Postgres, not Redis"
  docs-axi update 7 --status accepted
  docs-axi check
`;

type Handler = (ctx: Ctx, args: string[]) => AxiRenderable;

const COMMANDS: Record<string, { run: Handler; help: string }> = {
  init: { run: initCommand, help: `${INIT_SPEC.help}\nOptional: --sections <a,b,c> --adr <name|none> --guide name="text" applies the layout first.` },
  list: { run: listCommand, help: LIST_SPEC.help },
  search: { run: searchCommand, help: SEARCH_SPEC.help },
  show: { run: showCommand, help: SHOW_SPEC.help },
  new: { run: newCommand, help: NEW_SPEC.help },
  adr: { run: adrCommand, help: ADR_HELP },
  update: { run: updateCommand, help: UPDATE_SPEC.help },
  supersede: { run: supersedeCommand, help: SUPERSEDE_SPEC.help },
  index: { run: indexCommand, help: INDEX_SPEC.help },
  check: { run: checkCommand, help: CHECK_SPEC.help },
  migrate: { run: migrateCommand, help: MIGRATE_SPEC.help },
  sections: { run: sectionsCommand, help: SECTIONS_SPEC.help },
  write: { run: writeCommand, help: WRITE_SPEC.help },
  append: { run: appendCommand, help: APPEND_SPEC.help },
  config: { run: configCommand, help: CONFIG_HELP },
};

/** Value of `--name <v>` or `--name=<v>`. */
function valueFlag(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === name) return args[i + 1];
    if (a.startsWith(`${name}=`)) return a.slice(name.length + 1);
  }
  return undefined;
}

/** Args without `--repo <v>`, `--repo=<v>` and `--all-repos`. */
function withoutRepoFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a === "--repo") i++;
    else if (!a.startsWith("--repo=") && a !== "--all-repos") out.push(a);
  }
  return out;
}

/** Read-only use of another repo's docs: these commands (and `adr list|search`) only. */
function readsAcrossRepos(name: string, args: string[]): boolean {
  if (name === "list" || name === "search" || name === "show" || name === "sections") return true;
  return name === "adr" && (args[0] === "list" || args[0] === "search");
}

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
    const repo = valueFlag(args, "--repo");
    if (repo !== undefined) {
      const sources = sourceRepos(root);
      const hit = sources.repos.find((r) => r.name === repo);
      if (!hit) {
        const known = sources.repos.map((r) => r.name);
        throw new AxiError(`no readable docs repo "${repo}"`, "NOT_FOUND", [
          known.length > 0 ? `Repos: ${known.join(", ")}` : "No repo sets `docs` in [repos.<name>] of .plan-axi.toml",
          ...(sources.unavailable.includes(repo) ? [`${repo} is configured but its checkout or docs dir is not readable`] : []),
        ]);
      }
      return { root: hit.root, docsDir: hit.docsDir, config: loadConfig(hit.root) };
    }
    const flag = docsFlag(args);
    const config = loadConfig(root);
    const docsDir = flag === undefined ? resolve(root, config.layout.dir) : isAbsolute(flag) ? flag : resolve(cwd, flag);
    return { root, docsDir, config };
  };
  const commands: Record<string, (args: string[], ctx: Ctx | undefined) => AxiRenderable> = {};
  for (const [name, c] of Object.entries(COMMANDS)) {
    commands[name] = (rawArgs, ctx) => {
      const current = ctx as Ctx;
      const wantsRepo = valueFlag(rawArgs, "--repo") !== undefined;
      const all = rawArgs.includes("--all-repos");
      const args = wantsRepo || all ? withoutRepoFlags(rawArgs) : rawArgs;
      if ((wantsRepo || all) && !readsAcrossRepos(name, args)) {
        throw new AxiError(`--repo and --all-repos only work with read commands`, "VALIDATION_ERROR", [
          "Use them with list, search, show, sections, adr list or adr search; edit another repo's docs from that repo",
        ]);
      }
      if (all) {
        if (wantsRepo || name === "show" || name === "sections") {
          throw new AxiError("--all-repos works with list, search, adr list and adr search, and not together with --repo", "VALIDATION_ERROR");
        }
        const here = resolveCtx([]);
        const out: Record<string, unknown> = {};
        out[basename(here.root)] = c.run(here, args);
        for (const r of sourceRepos(here.root).repos) {
          out[r.name] = c.run({ root: r.root, docsDir: r.docsDir, config: loadConfig(r.root) }, args);
        }
        return out;
      }
      if (name === "init" && args.some((arg) => arg === "--sections" || arg.startsWith("--sections=") || arg === "--adr" || arg.startsWith("--adr="))) {
        const configResult = configCommand(current, args);
        const refreshed = resolveCtx(args);
        return { configuration: configResult, ...initCommand(refreshed, []) };
      }
      return c.run(current, args);
    };
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
