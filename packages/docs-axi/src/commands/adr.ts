import { AxiError } from "axi-sdk-js";
import type { AxiStructuredOutput } from "../types.js";
import { flagBool, flagStr, parseArgs, parseLimit, type CmdSpec } from "../args.js";
import { ADR_STATUSES, displayTitle, requireDocsDir, type Ctx, type Doc } from "../model.js";
import { findSectionOrUndefined, parseSections, sectionText, splitLines } from "../sections.js";
import { adrRenumberCommand } from "./adrrenumber.js";
import { listDocs, searchDocs, terms } from "./read.js";
import { ADR_SPEC, adrAddCommand, requireAdrSection } from "./write.js";

const DECISION_CHARS = 400;

export const ADR_HELP = `usage: docs-axi adr [list|search|add|renumber] [args] [flags]
Read and record ADRs in the configured ADR section.
subcommands:
  (none)                          ADR counts by status and hints
  list [--status <s>|all] [--full] [--limit <n>]   all ADRs; --full adds decision text
  search <terms...> [--all] [--full] [--limit <n>] ranked search over ADRs only
  add "<title>" --summary "<one line>" [flags]     create the next numbered ADR
  renumber <ref|path> [--to <n>]                   move an ADR to a new number and fix every ADR-NNNN-slug ref
examples:
  docs-axi adr list --status accepted
  docs-axi adr search cache --all
  docs-axi adr add "Use Postgres for the job queue" --summary "Why jobs live in Postgres"
${ADR_SPEC.help.split("\n").slice(1).join("\n")}`;

const LIST_SPEC: CmdSpec = {
  name: "adr list",
  flags: { "--status": "string", "--full": "boolean", "--limit": "string" },
  min: 0,
  max: 0,
  usage: "docs-axi adr list [--status <s>|all] [--full] [--limit <n>]",
  help: "",
};

const SEARCH_SPEC: CmdSpec = {
  name: "adr search",
  flags: { "--all": "boolean", "--full": "boolean", "--limit": "string" },
  min: 1,
  max: 20,
  usage: "docs-axi adr search <terms...> [--all] [--full] [--limit <n>]",
  help: "",
};

function num(d: Doc): string {
  return d.adrNumber === undefined ? "-" : String(d.adrNumber).padStart(4, "0");
}

function decision(d: Doc): string {
  const secs = parseSections(d.parsed.body);
  const s = findSectionOrUndefined(secs, "Decision");
  if (s === undefined) return "(no Decision section)";
  const text = sectionText(splitLines(d.parsed.body), s, false);
  if (text === "") return "(empty)";
  const flat = text.replace(/\s+/g, " ");
  return flat.length > DECISION_CHARS
    ? `${flat.slice(0, DECISION_CHARS)}... (truncated, ${flat.length} chars; \`docs-axi show ${d.path} --section Decision\`)`
    : flat;
}

function adrRow(d: Doc, full: boolean, matched?: string): Record<string, string> {
  const r: Record<string, string> = {
    number: num(d),
    title: displayTitle(d),
    status: d.status ?? "-",
    summary: d.summary ?? "(no summary)",
  };
  if (matched !== undefined) r["matched"] = matched;
  if (full) {
    r["decision"] = decision(d);
    r["superseded-by"] = d.supersededBy ?? "-";
  }
  return r;
}

function bare(ctx: Ctx, section: string): AxiStructuredOutput {
  const adrs = listDocs(ctx, { section }).hits;
  const by = ADR_STATUSES.map((st) => [st, adrs.filter((d) => d.status === st).length] as const).filter(
    ([, n]) => n > 0,
  );
  return {
    adrs: `${adrs.length} in ${section}`,
    status: Object.fromEntries(by),
    help: [
      "Run `docs-axi adr list [--status accepted] [--full]` to list ADRs",
      "Run `docs-axi adr search <terms> [--all]` to find ADRs by topic",
      'Run `docs-axi adr add "<title>" --summary "<one line>"` to record a decision',
    ],
  };
}

function list(ctx: Ctx, section: string, args: string[]): AxiStructuredOutput {
  const p = parseArgs(LIST_SPEC, args);
  const statusRaw = flagStr(p, "--status") ?? "all";
  if (statusRaw !== "all" && !(ADR_STATUSES as readonly string[]).includes(statusRaw)) {
    throw new AxiError(`invalid status ${statusRaw}`, "VALIDATION_ERROR", [
      `Use one of: ${ADR_STATUSES.join(", ")}, all`,
    ]);
  }
  const limit = parseLimit(p, 100);
  const full = flagBool(p, "--full");
  const { hits } = listDocs(ctx, { section, status: statusRaw === "all" ? undefined : statusRaw });
  if (hits.length === 0) {
    const total = listDocs(ctx, { section }).hits.length;
    return {
      adrs: `0 ADRs${statusRaw === "all" ? "" : ` with status=${statusRaw}`} (${total} ADRs total)`,
      help: ["Run `docs-axi adr list --status all` to see every ADR"],
    };
  }
  const shown = hits.slice(0, limit);
  const out: AxiStructuredOutput = {
    count: `${shown.length} of ${hits.length}`,
    adrs: shown.map((d) => adrRow(d, full)),
  };
  out["help"] = [
    ...(hits.length > shown.length ? [`Run \`docs-axi adr list --limit ${hits.length}\` for all`] : []),
    "Run `docs-axi show <number>` to read one",
  ];
  return out;
}

function search(ctx: Ctx, section: string, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SEARCH_SPEC, args);
  const limit = parseLimit(p, 10);
  const ts = terms(p.pos);
  if (ts.length === 0) {
    throw new AxiError("search needs at least one alphanumeric term", "VALIDATION_ERROR");
  }
  const full = flagBool(p, "--full");
  const scored = searchDocs(ctx, ts, { section, all: flagBool(p, "--all") });
  if (scored.length === 0) {
    return {
      adrs: `0 ADR matches for: ${ts.join(" ")}`,
      help: ["Run `docs-axi adr list` to browse all ADRs", "If no ADR covers this, say so in the plan"],
    };
  }
  const shown = scored.slice(0, limit);
  return {
    count: `${shown.length} of ${scored.length} matches`,
    adrs: shown.map((s) => adrRow(s.d, full, `${s.matched}/${s.total}`)),
    help: ["Run `docs-axi show <number>` to read one"],
  };
}

export function adrCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === "add") return adrAddCommand(ctx, rest);
  if (sub === "renumber") {
    return adrRenumberCommand(ctx, rest);
  }
  const section = requireAdrSection(ctx, "adr");
  if (sub === undefined || sub === "--docs" || sub.startsWith("--docs=")) {
    requireDocsDir(ctx);
    return bare(ctx, section);
  }
  requireDocsDir(ctx);
  if (sub === "list") return list(ctx, section, rest);
  if (sub === "search") return search(ctx, section, rest);
  throw new AxiError(`unknown adr subcommand "${sub}"`, "VALIDATION_ERROR", [
    sub.startsWith("--") ? "Subcommands: list, search, add, renumber" : `To create an ADR run: docs-axi adr add "${sub}" --summary "<one line>"`,
    "Subcommands: list, search, add, renumber",
  ]);
}

