import { existsSync, mkdirSync, readSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { flagBool, flagStr, parseArgs, requireSingleLine, type CmdSpec } from "docs-axi/lib/args";
import { readBodyInput } from "docs-axi/lib/body";
import { applyEol, writeText } from "docs-axi/lib/fsutil";
import { editSection, splitDoc } from "docs-axi/lib/sectionedit";
import { renderSection, sectionsTable } from "docs-axi/lib/commands/sections";
import type { AxiStructuredOutput } from "docs-axi/lib/types";
import { checkKind, deriveSlug, isUnplannedKind, listUnplanned, slugTaken, UNPLANNED_KINDS } from "./backlog.js";
import { archiveChange } from "./archive.js";
import { claim } from "./claim.js";
import { commitPlan } from "./commitplan.js";
import { done } from "./done.js";
import { loadGuidance } from "./guidance.js";
import { PI_THINKING_FALLBACK } from "./agent.js";
import { readPlanConfig } from "./planconfig.js";
import { buildCommand, buildProfileCommand, resolveAgent, runAgent } from "./agent.js";
import { preflightProfile } from "./preflight.js";
import { finishChange } from "./finish.js";
import { git } from "./git.js";
import { applySetup, hasSetupBlock, removeSetup } from "./setup.js";
import { listEnterable } from "./enter-list.js";
import { leaseRepos, leaseWorktree, startChange, type RepoWorktree } from "./start.js";
import { repoStateRows, repoStates } from "./repostate.js";
import { changeHome, currentChangeSlug, whereAmI } from "./home.js";
import { checkChange, computeWaves } from "./check.js";
import {
  activeDir,
  archivedDir,
  changeDir,
  checkSlug,
  getBacklogItem,
  headerLine,
  readLf,
  requireChange,
  requireReadable,
  resolveChange,
  resolveDoc,
  splitList,
  stepFiles,
  tasksRel,
  SLUG_RE,
  getDocsConfig,
  type BacklogItemInfo,
  type Ctx,
} from "./change.js";
import { PROPOSAL_HEADER_LINES, STEP_HEADER_LINES, STEP_SECTIONS, proposalSections, proposalSkeleton, stepSkeleton, TIERS, tierProfile } from "./spec.js";
import { listTasks, runTasks } from "./tasks.js";

const guideRows = (list: { name: string; guide: string }[]): Record<string, string>[] => list.map((s) => ({ section: s.name, guide: s.guide }));

// ---------------------------------------------------------------- home

export function homeCommand(ctx: Ctx): AxiStructuredOutput {
  const current = currentChangeSlug(ctx);
  if (current) return changeHome(ctx, current);
  const dir = activeDir(ctx);
  const slugs = existsSync(dir) ? readdirSync(dir).filter((f) => existsSync(join(dir, f, "proposal.md")) || existsSync(join(dir, f, "tasks.md"))).sort() : [];
  if (slugs.length === 0) {
    return { ...whereAmI(ctx), changes: "0 active changes", help: ['Run `change-axi new <slug> "<title>"` to start a plan', "Run `change-axi spec proposal` for the required sections"] };
  }
  const rows = slugs.map((slug) => {
    const tasks = existsSync(join(dir, slug, "tasks.md")) ? listTasks(ctx.root, tasksRel(slug)) : [];
    const done = tasks.filter((t) => t.state === "done").length;
    return { slug, steps: tasks.length, done, in_flight: tasks.filter((t) => t.state === "in_flight").length };
  });
  return { ...whereAmI(ctx), changes: rows, help: ["Run `change-axi status <slug>` for the step graph", "Run `change-axi check <slug>` to validate a plan"] };
}

// ---------------------------------------------------------------- spec

export const SPEC_SPEC: CmdSpec = {
  name: "spec",
  flags: {},
  min: 0,
  max: 1,
  usage: "change-axi spec [proposal|step]",
  help: `usage: change-axi spec [proposal|step]
Print the required sections of a proposal or step file, with what each must contain.
examples:
  change-axi spec proposal
  change-axi spec step
`,
};

export function specCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SPEC_SPEC, args);
  const which = p.pos[0];
  const sections = proposalSections(getDocsConfig(ctx).layout);
  if (which === "proposal") return { header: guideRows(PROPOSAL_HEADER_LINES), proposal: guideRows(sections), help: ['Fill with `change-axi write <slug> proposal --section "<name>" --body "..."`'] };
  if (which === "step") {
    return {
      header: guideRows(STEP_HEADER_LINES),
      step: guideRows(STEP_SECTIONS),
      help: ["Set Owns/Docs with `change-axi step set <slug> <step> --owns a,b --docs x`", 'Fill sections with `change-axi write <slug> <step> --section "<name>"`'],
    };
  }
  if (which !== undefined) throw new AxiError(`unknown kind ${which}`, "VALIDATION_ERROR", ["Kinds: proposal, step"]);
  return { proposalHeader: guideRows(PROPOSAL_HEADER_LINES), proposal: guideRows(sections), header: guideRows(STEP_HEADER_LINES), step: guideRows(STEP_SECTIONS) };
}

// ---------------------------------------------------------------- new

export const NEW_SPEC: CmdSpec = {
  name: "new",
  flags: { "--from": "string" },
  min: 1,
  max: 2,
  usage: 'change-axi new <slug> ["<title>"] [--from <old-slug>]',
  help: `usage: change-axi new <slug> ["<title>"] [--from <old-slug>]
Create specs/changes/active/<slug>/proposal.md (empty required sections), ensure .tasks.toml, and queue the change in backlog.md.
slug: kebab-case, verb first, max 50 chars. Must not be active, archived, or already a planned change in the backlog.
Adopt: when <slug> is an unplanned backlog item (kind idea|bug|chore from \`change-axi idea\`), it becomes a change in place.
The title is optional then (the item's title is kept) and the item body seeds the proposal's Why section.
--from <old-slug>: adopt the unplanned item <old-slug> under a new slug. Title, body, priority, repo and blocked-by links
are carried over; the old item is removed. Both happen or neither does.
Does not commit.
examples:
  change-axi new split-auth-module "Split the auth module"
  change-axi new dark-mode-toggle
  change-axi new add-dark-mode --from dark-mode-toggle
`,
};

function seedWhy(skeleton: string, body: string): string {
  const text = body.trim();
  return text === "" ? skeleton : skeleton.replace("## Why\n", `## Why\n\n${text}\n`);
}

function tryRun(ctx: Ctx, args: string[]): void {
  try {
    runTasks(ctx.root, args);
  } catch {
    /* best effort rollback */
  }
}

export function newCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(NEW_SPEC, args);
  const slug = p.pos[0] as string;
  const titleArg = p.pos[1] === undefined ? undefined : requireSingleLine("title", p.pos[1]);
  const from = flagStr(p, "--from");
  checkSlug(slug);
  const dir = changeDir(ctx, slug);
  const taken = resolveChange(ctx, slug);
  const adopt = from === undefined && taken?.state === "backlog" && taken.kind !== undefined && isUnplannedKind(taken.kind);
  if (taken && !adopt) {
    const where = slugTaken(ctx, slug) as string;
    throw new AxiError(`slug "${slug}" is taken (${where})`, "VALIDATION_ERROR", [
      "Slugs are never reused. Pick a more specific name, e.g. add a scope or qualifier (`" + slug + "-<scope>`)",
      `Inspect the existing one with \`change-axi where ${slug}\``,
    ]);
  }
  let source: BacklogItemInfo | undefined;
  if (from !== undefined) {
    checkSlug(from);
    source = getBacklogItem(ctx, from);
    if (!source || !isUnplannedKind(source.kind) || resolveChange(ctx, from)?.rel) {
      throw new AxiError(`--from "${from}" is not an unplanned backlog item`, "VALIDATION_ERROR", [
        "Only items from `change-axi idea` (kind idea|bug|chore) can be renamed this way",
        "Run `change-axi backlog` to list them",
      ]);
    }
  } else if (adopt) {
    source = getBacklogItem(ctx, slug);
  }
  const title = titleArg ?? source?.title;
  if (title === undefined || title === "") {
    throw new AxiError("title is required", "VALIDATION_ERROR", [`usage: ${NEW_SPEC.usage}`]);
  }
  mkdirSync(dir, { recursive: true });
  try {
    writeText(join(dir, "proposal.md"), seedWhy(proposalSkeleton(title), source?.body ?? ""));
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  const toml = join(ctx.root, ".tasks.toml");
  let tomlNote = "present";
  if (!existsSync(toml)) {
    writeFileSync(toml, "[markdown]\ndone_keep = 1000\n");
    tomlNote = "created";
  }
  let carried: string[] = [];
  try {
    if (from !== undefined && source) {
      runTasks(ctx.root, [
        "add", slug, title, "--kind", "change",
        ...(source.repo !== undefined ? ["--repo", source.repo] : []),
        ...(source.priority !== undefined ? ["--priority", source.priority] : []),
        ...(source.body !== "" ? ["--body", source.body] : []),
        "--file", "backlog.md",
      ]);
      try {
        for (const b of source.blockedBy) runTasks(ctx.root, ["block", slug, "--by", b, "--file", "backlog.md"]);
        runTasks(ctx.root, ["rm", from, "--file", "backlog.md"]);
      } catch (e) {
        tryRun(ctx, ["rm", slug, "--file", "backlog.md"]);
        throw e;
      }
      carried = source.blockedBy;
    } else if (adopt) {
      runTasks(ctx.root, ["update", slug, "--kind", "change", ...(titleArg !== undefined ? ["--title", titleArg] : []), "--file", "backlog.md"]);
    } else {
      runTasks(ctx.root, ["add", slug, title, "--kind", "change", "--file", "backlog.md"]);
    }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return {
    created: `specs/changes/active/${slug}/proposal.md`,
    backlog: from !== undefined ? `${slug} queued (renamed from ${from})` : adopt ? `${slug} adopted (was ${source?.kind})` : `${slug} queued`,
    ...(carried.length > 0 ? { blocked_by: carried.join(",") } : {}),
    tasks_toml: tomlNote,
    sections: guideRows(proposalSections(getDocsConfig(ctx).layout)),
    help: [
      `Fill each with \`change-axi write ${slug} proposal --section "<name>"\` (body on stdin)`,
      `Add steps with \`change-axi step add ${slug} "<title>" --owns <paths>\``,
    ],
  };
}

// ---------------------------------------------------------------- idea / backlog

export const IDEA_SPEC: CmdSpec = {
  name: "idea",
  flags: { "--kind": "string", "--slug": "string", "--body": "string", "--priority": "string", "--repo": "string" },
  min: 1,
  max: 1,
  usage: 'change-axi idea "<one-liner>" [--kind idea|bug|chore] [--slug <s>] [--body <text>] [--priority 0-4] [--repo <name>]',
  help: `usage: change-axi idea "<one-liner>" [--kind idea|bug|chore] [--slug <s>] [--body <text>] [--priority 0-4] [--repo <name>]
Capture an unplanned item in backlog.md (no plan files). Kind defaults to idea; priority 0 is highest.
The slug is derived from the one-liner unless --slug is given. Slugs are never reused (active, archived, or any backlog item).
Does not commit. Turn an item into a plan later with plan-propose.
examples:
  change-axi idea "dark mode toggle" --kind chore --priority 1 --repo web
  change-axi idea "Login fails on empty password" --kind bug --body "Seen on staging"
`,
};

export function ideaCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(IDEA_SPEC, args);
  const title = requireSingleLine("title", p.pos[0] as string);
  const kind = checkKind(flagStr(p, "--kind") ?? "idea");
  const slug = flagStr(p, "--slug") ?? deriveSlug(title);
  checkSlug(slug);
  const prio = flagStr(p, "--priority");
  if (prio !== undefined && !/^[0-4]$/.test(prio)) throw new AxiError(`bad priority "${prio}"`, "VALIDATION_ERROR", ["Use 0-4 (0 is highest)"]);
  const where = slugTaken(ctx, slug);
  if (where !== undefined) {
    throw new AxiError(`slug "${slug}" is taken (${where})`, "VALIDATION_ERROR", [
      `Pick another with \`--slug ${slug}-<scope>\``,
      `Inspect the existing one with \`change-axi where ${slug}\``,
    ]);
  }
  const repo = flagStr(p, "--repo");
  const body = flagStr(p, "--body");
  const toml = join(ctx.root, ".tasks.toml");
  if (!existsSync(toml)) writeFileSync(toml, "[markdown]\ndone_keep = 1000\n");
  runTasks(ctx.root, [
    "add", slug, title, "--kind", kind,
    ...(repo !== undefined ? ["--repo", repo] : []),
    ...(prio !== undefined ? ["--priority", prio] : []),
    ...(body !== undefined ? ["--body", body] : []),
    "--file", "backlog.md",
  ]);
  return { idea: `${slug} queued`, kind, ...(prio !== undefined ? { priority: Number(prio) } : {}), ...(repo !== undefined ? { repo } : {}), help: ["Run `change-axi backlog` to list unplanned items", `Plan it later with plan-propose (slug ${slug})`] };
}

export const BACKLOG_SPEC: CmdSpec = {
  name: "backlog",
  flags: {},
  min: 0,
  max: 0,
  usage: "change-axi backlog",
  help: `usage: change-axi backlog
List unplanned backlog items (kinds: ${UNPLANNED_KINDS.join(", ")}) sorted by priority then age.
examples:
  change-axi backlog
`,
};

export function backlogCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(BACKLOG_SPEC, args);
  const items = listUnplanned(ctx);
  if (items.length === 0) return { backlog: "0 unplanned items", help: ['Capture one with `change-axi idea "<one-liner>"`'] };
  return {
    backlog: items.map((i) => ({ slug: i.slug, kind: i.kind, priority: i.priority ?? "-", repo: i.repo || "-", title: i.title })),
    help: ["Turn an item into a plan with plan-propose (use the slug)"],
  };
}

// ---------------------------------------------------------------- step add / set

const STEP_FLAGS = {
  "--owns": "string",
  "--docs": "string",
  "--after": "string",
  "--name": "string",
  "--title": "string",
  "--tier": "string",
} as const;

export const STEP_SPEC: CmdSpec = {
  name: "step",
  flags: STEP_FLAGS,
  min: 2,
  max: 4,
  usage: 'change-axi step add <slug> "<title>" --owns a,b [--docs x,y] [--after id,id] [--name <kebab>] [--tier <t>] | step set <slug> <step> [--owns ..] [--docs ..] [--title ..] [--tier <t|none>]',
  help: `usage:
  change-axi step add <slug> "<title>" --owns a,b [--docs x,y] [--after id,id] [--name <kebab>] [--tier <t>]
  change-axi step set <slug> <step> [--owns a,b] [--docs x,y] [--title "<t>"] [--tier <small|standard|deep|none>]
add: next number NN, creates NN-<name>.md (empty required sections) and its task (body "Spec: NN-<name>.md").
  --owns   repo paths/globs the step EDITS (required)
  --docs   docs to read first (default none)
  --after  step ids this step depends on (must exist)
  --name   file slug (default from title)
  --tier   small, standard or deep: the agent profile via [apply.tiers] (optional)
set: edit the Owns/Docs/Tier header lines (--tier none removes it) or the title (also retitles the task).
Dependencies later: change-axi dep <slug> <step> --on|--off <ids>
examples:
  change-axi step add split-auth "Extract token store" --owns src/auth/tokens/ --after 01-schema
`,
};

function checkTier(v: string | undefined, allowNone: boolean): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  if (allowNone && t === "none") return "none";
  if (!(TIERS as readonly string[]).includes(t)) {
    throw new AxiError(`bad tier "${t}"`, "VALIDATION_ERROR", [`--tier: ${TIERS.join(", ")}${allowNone ? ", none" : ""}`]);
  }
  return t;
}

function slugName(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}

export function stepCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(STEP_SPEC, args);
  const [sub, slug] = p.pos as [string, string];
  const dir = requireChange(ctx, slug);
  if (sub === "add") return stepAdd(ctx, dir, slug, p.pos[2], p);
  if (sub === "set") return stepSet(ctx, dir, slug, p.pos[2], p);
  throw new AxiError(`unknown step command ${sub}`, "VALIDATION_ERROR", ["Use `step add` or `step set`"]);
}

/** Resolve an exact step id or a numeric/name prefix (`01` -> `01-name`). */
export function resolveStepId(known: string[], id: string, ctxMsg = ""): string {
  if (known.includes(id)) return id;
  const hits = known.filter((k) => k.startsWith(`${id}-`)).sort();
  if (hits.length === 1) return hits[0] as string;
  if (hits.length > 1) throw new AxiError(`${ctxMsg}"${id}" is ambiguous`, "VALIDATION_ERROR", [`Matches: ${hits.join(", ")}`]);
  throw new AxiError(`${ctxMsg}no step "${id}"`, "NOT_FOUND", [`Steps: ${[...known].sort().join(", ") || "(none)"}`]);
}

function stepAdd(ctx: Ctx, dir: string, slug: string, titleArg: string | undefined, p: ReturnType<typeof parseArgs>): AxiStructuredOutput {
  if (titleArg === undefined) throw new AxiError("step add needs a title", "VALIDATION_ERROR", [`usage: ${STEP_SPEC.usage}`]);
  const title = requireSingleLine("title", titleArg);
  const owns = splitList(flagStr(p, "--owns"));
  if (owns.length === 0) throw new AxiError("--owns is required", "VALIDATION_ERROR", ["Paths the step edits, e.g. --owns src/auth/,tests/auth/"]);
  const docs = splitList(flagStr(p, "--docs"));
  const tier = checkTier(flagStr(p, "--tier"), false);
  const name = flagStr(p, "--name") ?? slugName(title);
  if (!SLUG_RE.test(name)) throw new AxiError(`bad step name "${name}"`, "VALIDATION_ERROR", ["kebab-case, from --name or the title"]);
  const existing = stepFiles(dir);
  const next = existing.reduce((m, f) => Math.max(m, Number(f.slice(0, 2))), 0) + 1;
  const num = String(next).padStart(2, "0");
  const id = `${num}-${name}`;
  if (next > 99) throw new AxiError("too many steps", "VALIDATION_ERROR", ["Split the change"]);
  const known = listTasks(ctx.root, tasksRel(slug)).map((t) => t.id);
  const after = splitList(flagStr(p, "--after")).map((a) => resolveStepId(known, a, "--after: "));
  const file = join(dir, `${id}.md`);
  writeText(file, stepSkeleton(num, title, owns, docs, tier));
  try {
    runTasks(ctx.root, [
      "add", id, title, "--file", tasksRel(slug), "--body", `Spec: ${id}.md`,
      ...after.flatMap((a) => ["--blocked-by", a]),
    ]);
  } catch (e) {
    rmSync(file, { force: true });
    throw e;
  }
  return {
    created: `specs/changes/active/${slug}/${id}.md`,
    task: id,
    ...(tier ? { tier } : {}),
    blocked_by: after.length > 0 ? after.join(",") : "none",
    sections: guideRows(STEP_SECTIONS),
    help: [`Fill each with \`change-axi write ${slug} ${id} --section "<name>"\``, `List it in proposal "Steps": \`change-axi append ${slug} proposal --section Steps --body "- \\\`${id}.md\\\` - ${title}"\``],
  };
}

function stepSet(ctx: Ctx, dir: string, slug: string, which: string | undefined, p: ReturnType<typeof parseArgs>): AxiStructuredOutput {
  if (which === undefined) throw new AxiError("step set needs a step", "VALIDATION_ERROR", [`usage: ${STEP_SPEC.usage}`]);
  const file = resolveDoc(dir, which);
  if (file === "proposal.md") throw new AxiError("not a step", "VALIDATION_ERROR");
  const abs = join(dir, file);
  const raw = readLf(abs);
  let text = raw;
  const owns = flagStr(p, "--owns");
  const docs = flagStr(p, "--docs");
  const title = flagStr(p, "--title");
  const tier = checkTier(flagStr(p, "--tier"), true);
  if (owns === undefined && docs === undefined && title === undefined && tier === undefined) throw new AxiError("nothing to set", "VALIDATION_ERROR", [`usage: ${STEP_SPEC.usage}`]);
  const setLine = (key: string, value: string): void => {
    const re = new RegExp(`^${key}:.*$`, "m");
    text = re.test(text) ? text.replace(re, `${key}: ${value}`) : text.replace(/^(# .*\n\n?)/, `$1${key}: ${value}\n`);
  };
  if (owns !== undefined) {
    const list = splitList(owns);
    if (list.length === 0) throw new AxiError("--owns needs at least one path", "VALIDATION_ERROR");
    setLine("Owns", list.join(", "));
  }
  if (docs !== undefined) setLine("Docs", splitList(docs).join(", ") || "none");
  if (tier === "none") text = text.replace(/^Tier:.*\n/m, "");
  else if (tier !== undefined) {
    if (/^Tier:/m.test(text)) text = text.replace(/^Tier:.*$/m, `Tier: ${tier}`);
    else if (/^Docs:.*$/m.test(text)) text = text.replace(/^(Docs:.*)$/m, `$1\nTier: ${tier}`);
    else setLine("Tier", tier);
  }
  if (title !== undefined) {
    const t = requireSingleLine("--title", title);
    text = text.replace(/^# (\d+) - .*$/m, `# $1 - ${t}`);
  }
  const changed = text !== raw;
  if (changed) writeText(abs, applyEol(text, "\n"));
  if (title !== undefined) runTasks(ctx.root, ["update", file.replace(/\.md$/, ""), "--title", title.trim(), "--file", tasksRel(slug)]);
  return { step: `${file} ${changed || title !== undefined ? "updated" : "unchanged (no-op)"}`, owns: headerLine(text, "Owns") ?? "-", docs: headerLine(text, "Docs") ?? "-", tier: headerLine(text, "Tier") ?? "-" };
}

// ---------------------------------------------------------------- dep

export const DEP_SPEC: CmdSpec = {
  name: "dep",
  flags: { "--on": "string", "--off": "string" },
  min: 2,
  max: 2,
  usage: "change-axi dep <slug> <step> --on <ids> | --off <ids>",
  help: `usage: change-axi dep <slug> <step> --on <ids> | --off <ids>
Add (--on) or remove (--off) dependencies of a step, comma separated. An edge that creates a cycle is reverted and fails.
examples:
  change-axi dep split-auth 03-api --on 01-schema,02-store
  change-axi dep split-auth 03-api --off 02-store
`,
};

export function depCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(DEP_SPEC, args);
  const slug = p.pos[0] as string;
  requireChange(ctx, slug);
  const on = splitList(flagStr(p, "--on"));
  const off = splitList(flagStr(p, "--off"));
  if (on.length + off.length === 0) throw new AxiError("pass --on and/or --off", "VALIDATION_ERROR", [`usage: ${DEP_SPEC.usage}`]);
  const file = tasksRel(slug);
  const tasks = listTasks(ctx.root, file);
  const find = (id: string): string => resolveStepId(tasks.map((t) => t.id), id);
  const step = find(p.pos[1] as string);
  const onIds = on.map(find);
  const offIds = off.map(find);
  if (onIds.includes(step)) throw new AxiError("a step cannot depend on itself", "VALIDATION_ERROR");
  for (const b of onIds) runTasks(ctx.root, ["block", step, "--by", b, "--file", file]);
  for (const b of offIds) runTasks(ctx.root, ["unblock", step, "--by", b, "--file", file]);
  const now = listTasks(ctx.root, file).filter((t) => t.state !== "done");
  const { cycle } = computeWaves(now);
  if (cycle.length > 0) {
    for (const b of onIds) runTasks(ctx.root, ["unblock", step, "--by", b, "--file", file]);
    for (const b of offIds) runTasks(ctx.root, ["block", step, "--by", b, "--file", file]);
    throw new AxiError(`dependency would create a cycle (${cycle.join(", ")}); reverted`, "VALIDATION_ERROR");
  }
  const after = now.find((t) => t.id === step);
  return { dep: `${step} blocked_by ${after && after.blockers.length > 0 ? after.blockers.join(",") : "none"}` };
}

// ---------------------------------------------------------------- doc sections

const DOC_FLAGS = {
  "--section": "string",
  "--body": "string",
  "--body-file": "string",
  "--add": "boolean",
  "--after": "string",
  "--tree": "boolean",
} as const;

export const SECTIONS_SPEC: CmdSpec = {
  name: "sections",
  flags: {},
  min: 2,
  max: 2,
  usage: "change-axi sections <slug> <proposal|step>",
  help: `usage: change-axi sections <slug> <proposal|step>
List headings of a change doc with their ref, level, line and chars (empty = no text yet).
<step> is 01, 01-name or 01-name.md.
`,
};
export const SHOW_SPEC: CmdSpec = {
  name: "show",
  flags: { "--section": "string", "--tree": "boolean" },
  min: 2,
  max: 2,
  usage: "change-axi show <slug> <proposal|step> [--section <ref> [--tree]]",
  help: `usage: change-axi show <slug> <proposal|step> [--section <ref> [--tree]]
Print a change doc, or one section of it. Refs: see \`change-axi sections\`.
Archived changes are read-only. Refer to a change from another as \`change:<slug>\`, not by path.
`,
};
export const WRITE_SPEC: CmdSpec = {
  name: "write",
  flags: DOC_FLAGS,
  min: 2,
  max: 2,
  usage: "change-axi write <slug> <proposal|step> --section <ref> [--body <t> | --body-file <p>] [--add] [--after <ref>] [--tree]",
  help: `usage: change-axi write <slug> <proposal|step> --section <ref> [flags]
Replace one section's content (body from stdin, --body or --body-file; - = stdin). Heading kept. Output never echoes the body.
--add creates a missing section; --after places it; --tree also replaces subsections.
examples:
  printf 'Slow builds.' | change-axi write split-auth proposal --section Why
`,
};
export const APPEND_SPEC: CmdSpec = { ...WRITE_SPEC, name: "append", usage: WRITE_SPEC.usage.replace("write", "append"), help: WRITE_SPEC.help.replace(/write/g, "append").replace("Replace one section's content", "Add to the end of a section's content") };

function docPath(ctx: Ctx, slug: string, which: string, write = false): { abs: string; label: string } {
  if (write) {
    const dir = requireChange(ctx, slug);
    const file = resolveDoc(dir, which);
    return { abs: join(dir, file), label: `specs/changes/active/${slug}/${file}` };
  }
  const r = requireReadable(ctx, slug);
  const file = resolveDoc(r.dir, which);
  return { abs: join(r.dir, file), label: `${r.rel}/${file}${r.state === "archived" ? " (archived, read-only)" : ""}` };
}

export function sectionsCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SECTIONS_SPEC, args);
  const d = docPath(ctx, p.pos[0] as string, p.pos[1] as string);
  return { doc: d.label, sections: sectionsTable(readLf(d.abs)) };
}

export function showCommand(ctx: Ctx, args: string[]): string {
  const p = parseArgs(SHOW_SPEC, args);
  const d = docPath(ctx, p.pos[0] as string, p.pos[1] as string);
  const raw = readLf(d.abs);
  const sel = flagStr(p, "--section");
  if (sel !== undefined) return renderSection(raw, d.label, sel, flagBool(p, "--tree"));
  return `doc: ${d.label}\n\n${raw.replace(/\n+$/, "")}`;
}

function edit(ctx: Ctx, args: string[], mode: "write" | "append"): AxiStructuredOutput {
  let p: ReturnType<typeof parseArgs>;
  try {
    p = parseArgs(mode === "write" ? WRITE_SPEC : APPEND_SPEC, args);
  } catch (e) {
    if (e instanceof AxiError && e.code === "VALIDATION_ERROR" && /arguments? for/.test(e.message)) {
      throw new AxiError(e.message, "VALIDATION_ERROR", [`Valid form: printf '<text>' | change-axi ${mode} <slug> <proposal|step-id> --section "<name>"`, "Only <slug> and the doc are positional; the section is --section and the text comes from stdin, --body or --body-file"]);
    }
    throw e;
  }
  const sel = flagStr(p, "--section");
  if (sel === undefined || sel.trim() === "") throw new AxiError("--section is required", "VALIDATION_ERROR", [`Run \`change-axi sections ${p.pos[0]} ${p.pos[1]}\``]);
  const d = docPath(ctx, p.pos[0] as string, p.pos[1] as string, true);
  const raw = readLf(d.abs);
  const text = readBodyInput(p) as string;
  const afterSel = flagStr(p, "--after");
  const r = editSection(raw, { mode, selector: sel, text, add: flagBool(p, "--add"), tree: flagBool(p, "--tree"), ...(afterSel !== undefined ? { after: afterSel } : {}) });
  if (!r.changed) return { [mode]: `${d.label} "${r.ref}" unchanged (no-op)` };
  writeText(d.abs, r.next);
  const out: AxiStructuredOutput = { [mode]: `${d.label} "${r.ref}" ${r.action}`, lines: r.lines };
  const remaining = sectionsTable(r.next).filter((s) => s["level"] === 2 && s["empty"] === "yes").map((s) => s["ref"]);
  if (remaining.length > 0) out["still_empty"] = remaining.join(", ");
  return out;
}

export const writeCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => edit(ctx, args, "write");
export const appendCommand = (ctx: Ctx, args: string[]): AxiStructuredOutput => edit(ctx, args, "append");

// ---------------------------------------------------------------- check / status

export const CHECK_SPEC: CmdSpec = {
  name: "check",
  flags: { "--waves": "boolean" },
  min: 1,
  max: 1,
  usage: "change-axi check <slug> [--waves]",
  help: `usage: change-axi check <slug> [--waves]
Validate a plan: task graph cycles, step file <-> task links, required non-empty sections, slug reuse,
Owns in tool dirs, \`change:<slug>\` refs (unknown slug = error; specs/changes paths warn), and Owns overlap between steps that can run in parallel. Exit 1 on errors.
tasks-axi accepts dependency cycles silently; this catches them.
  --waves   print parallel waves
`,
};

export function checkCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(CHECK_SPEC, args);
  const slug = p.pos[0] as string;
  requireChange(ctx, slug);
  const r = checkChange(ctx, slug);
  const out: AxiStructuredOutput = {
    check: r.errors.length === 0 ? `ok (${r.tasks.length} tasks, ${r.active.length} unfinished, ${r.steps} step files)` : `${r.errors.length} error(s)`,
  };
  if (r.errors.length > 0) out["errors"] = r.errors;
  if (r.warnings.length > 0) out["warnings"] = r.warnings;
  if (flagBool(p, "--waves") && r.waves.size > 0) out["waves"] = [...r.waves].map(([w, ids]) => ({ wave: w, steps: ids.join(",") }));
  if (r.errors.length > 0) process.exitCode = 1;
  return out;
}

export const STATUS_SPEC: CmdSpec = {
  name: "status",
  flags: {},
  min: 1,
  max: 1,
  usage: "change-axi status <slug>",
  help: `usage: change-axi status <slug>
Steps with state, dependencies, wave, and which are ready to start now.
`,
};

/** Ids of steps that can start now: queued with no open blockers. */
export function readyStepIds(tasks: ReturnType<typeof listTasks>): string[] {
  return tasks.filter((t) => t.state === "queued" && t.blockers.length === 0).map((t) => t.id);
}

export function statusCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(STATUS_SPEC, args);
  const slug = p.pos[0] as string;
  const rc = requireReadable(ctx, slug);
  const archived = rc.state === "archived";
  const tasks = listTasks(ctx.root, `${rc.rel}/tasks.md`);
  const active = tasks.filter((t) => t.state !== "done");
  const { waves } = computeWaves(active);
  const waveOf = new Map<string, number>();
  for (const [w, ids] of waves) for (const id of ids) waveOf.set(id, w);
  const ready = readyStepIds(tasks);
  const repos = archived ? [] : repoStateRows(repoStates(ctx, slug));
  if (archived) {
    return {
      change: `${slug} (archived, read-only)`,
      path: rc.rel,
      progress: `${tasks.length - active.length}/${tasks.length} done`,
      steps: tasks.map((t) => ({ id: t.id, state: t.state, blocked_by: t.blockers.join(",") || "none", wave: "-" })),
    };
  }
  return {
    change: slug,
    ...whereAmI(ctx),
    ...(repos.length > 0 ? { repos } : {}),
    progress: `${tasks.length - active.length}/${tasks.length} done`,
    steps: tasks.map((t) => ({ id: t.id, state: t.state, blocked_by: t.blockers.join(",") || "none", wave: waveOf.get(t.id) ?? "-" })),
    ready: ready.join(",") || "none",
    help: statusHelp(ctx, slug, ready, active.length === 0),
  };
}

/** Next-action hints: in the change worktree give the prompt, elsewhere point at `enter`. */
function statusHelp(ctx: Ctx, slug: string, ready: string[], allDone: boolean): string[] {
  if (allDone) return [`All steps done; run \`change-axi archive ${slug} --dry-run\``];
  if (!ready[0]) return ["No ready steps; waiting on in-flight steps"];
  if (git(ctx, ["branch", "--show-current"], true) === slug) return [`Tell the agent: apply ${slug} ${ready[0]}`];
  return [
    `Run \`change-axi enter ${slug} ${ready[0]}\` to lease the worktree and launch your agent on that step`,
    `Omit the step to resume an in-flight one; add --print to only show the command`,
  ];
}

// ---------------------------------------------------------------- claim

export const CLAIM_SPEC: CmdSpec = {
  name: "claim",
  flags: {},
  min: 1,
  max: 2,
  usage: "change-axi claim <slug> [step]",
  help: `usage: change-axi claim <slug> [step]
Start a step (tasks-axi start) and print its Owns, Docs and Goal/Context/Work/Done when.
No step: the lowest-id ready step. Repeat claim of an in-flight step reports already: true.
Refuses done and blocked steps. <step> is 01, 01-name or 01-name.md.
examples:
  change-axi claim split-auth
  change-axi claim split-auth 02
`,
};

export function claimCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(CLAIM_SPEC, args);
  const slug = p.pos[0] as string;
  const stepArg = p.pos[1]?.replace(/\.md$/, "");
  const r = claim(ctx, slug, stepArg);
  const out: AxiStructuredOutput = { claim: r.already ? `${r.step} already in flight` : `${r.step} started`, step: r.step, already: r.already, owns: r.owns || "none", docs: r.docs || "none" };
  Object.assign(out, r.sections);
  out["help"] = [`Commit only your Owns paths, then \`tasks-axi done ${r.step} --file ${tasksRel(slug)}\``];
  return out;
}

// ---------------------------------------------------------------- done

export const DONE_SPEC: CmdSpec = {
  name: "done",
  flags: { "--since": "string" },
  min: 2,
  max: 2,
  usage: "change-axi done <slug> <step> [--since <rev>]",
  help: `usage: change-axi done <slug> <step> [--since <rev>]
Mark a started step done (tasks-axi done) and commit only tasks.md as "<type>(<scope>): done <step>".
Warns (OUTSIDE_OWNS) about paths committed since the last tasks.md commit (or --since) that are not in the step's Owns.
Commit your own work first. Other staged or dirty files are left alone.
examples:
  change-axi done split-auth 01
`,
};

export function doneCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(DONE_SPEC, args);
  const r = done(ctx, p.pos[0] as string, p.pos[1] as string, flagStr(p, "--since"));
  const out: AxiStructuredOutput = { done: `${r.step} done`, commit: r.commit };
  if (r.warnings.length > 0) out["warnings"] = r.warnings;
  return out;
}

// ---------------------------------------------------------------- commit-plan

export const COMMIT_PLAN_SPEC: CmdSpec = {
  name: "commit-plan",
  flags: { "--reason": "string", "--dry-run": "boolean" },
  min: 0,
  max: 1,
  usage: "change-axi commit-plan [<slug>] [--reason <text>] [--dry-run]",
  help: `usage: change-axi commit-plan [<slug>] [--reason <text>] [--dry-run]
The human step after plan-propose: commit the generated plan (plan folder, backlog.md, docs dir) as
"docs(plan): propose <slug>" with a Change trailer (see [commit] config). Other dirty files are not staged.
Without a slug, picks the one active plan with uncommitted changes; several -> pass a slug.
Fails if the plan check fails.
  --reason <text>  use <text> as the subject, for plan amendments
  --dry-run        print the message and paths, commit nothing
examples:
  change-axi commit-plan
  change-axi commit-plan split-auth --reason "drop step 03"
`,
};

export function commitPlanCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(COMMIT_PLAN_SPEC, args);
  const r = commitPlan(ctx, p.pos[0], { dryRun: flagBool(p, "--dry-run"), ...(flagStr(p, "--reason") !== undefined ? { reason: flagStr(p, "--reason") as string } : {}) });
  const out: AxiStructuredOutput = r.commit
    ? { commit_plan: `${r.slug} committed`, commit: r.commit, files: r.files.join(", ") }
    : { commit_plan: `${r.slug} (dry run, nothing committed)`, message: r.message, paths: r.paths.join(", "), files: r.files.join(", ") };
  if (r.warnings.length > 0) out["warnings"] = r.warnings;
  return out;
}

// ---------------------------------------------------------------- archive

export const ARCHIVE_SPEC: CmdSpec = {
  name: "archive",
  flags: { "--dry-run": "boolean", "--commit": "boolean", "--skip-docs-check": "boolean" },
  min: 1,
  max: 1,
  usage: "change-axi archive <slug> [--dry-run] [--commit] [--skip-docs-check]",
  help: `usage: change-axi archive <slug> [--dry-run] [--commit] [--skip-docs-check]
Finish a change. Run on branch <slug> (preferred) or on the default branch after merging it.
Checks: clean tree (specs, docs, backlog.md), all tasks done, plan check passes, every doc in Docs impact exists
and changed since the plan commit (ADRs exempt). Then: accepts proposed ADRs listed in Docs impact (reindexes),
git mv to specs/changes/archived/<date>-<slug>, marks the backlog task done.
  --dry-run          run the checks, report ADRs that would be accepted, change nothing
  --commit           commit everything as "chore(plan): archive <slug>" with a Change trailer
  --skip-docs-check  allow Docs impact docs that were not changed (say why in the commit message)
Idempotent: an already archived change only ensures the backlog task is done.
If an accepted ADR replaces an older one: docs-axi supersede <old> --by <new>.
examples:
  change-axi archive split-auth --dry-run
  change-axi archive split-auth --commit
`,
};

export function archiveCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(ARCHIVE_SPEC, args);
  const slug = p.pos[0] as string;
  const dry = flagBool(p, "--dry-run");
  const r = archiveChange(ctx, slug, { dryRun: dry, commit: flagBool(p, "--commit"), skipDocsCheck: flagBool(p, "--skip-docs-check") });
  if (r.already) return { archive: `${slug} already archived`, path: r.target, backlog: "done" };
  const out: AxiStructuredOutput = { archive: dry ? `${slug} ready (dry run, nothing changed)` : `${slug} archived`, mode: r.mode, path: r.target };
  if (r.adrs.length > 0) out["adrs"] = r.adrs;
  if (r.untouched.length > 0) out["docs_not_updated"] = r.untouched.join(", ");
  if (r.references) out["old_path_references"] = r.references.slice(0, 20).join(", ") + (r.references.length > 20 ? ` (+${r.references.length - 20} more)` : "");
  if (r.commit) out["commit"] = r.commit;
  if (r.next) out["next"] = r.next;
  const help: string[] = [];
  if (dry) help.push(`Run \`change-axi archive ${slug} --commit\` to apply`);
  else if (!r.commit) help.push("Commit: git add -- specs docs backlog.md && git commit -m \"archive " + slug + "\"");
  if (r.references) help.push(`Nothing is rewritten. Replace references to the old path with \`change:${slug}\``);
  if (help.length > 0) out["help"] = help;
  return out;
}

// ---------------------------------------------------------------- start

export const START_SPEC: CmdSpec = {
  name: "start",
  flags: { "--dry-run": "boolean", "--no-worktree": "boolean" },
  min: 1,
  max: 1,
  usage: "change-axi start <slug> [--dry-run] [--no-worktree]",
  help: `usage: change-axi start <slug> [--dry-run] [--no-worktree]
Launch a committed plan. Run on the default branch (the main checkout).
Preflight: not behind the remote, plan committed and clean, plan check passes, backlog task queued.
Then: marks the change in flight in backlog.md and commits only that file ("chore(plan): start <slug>", Change trailer),
and leases a treehouse worktree on branch <slug> (reused if one already exists for it).
Idempotent: an in-flight change is not started twice; the worktree is looked up instead.
With a proposal \`Repos:\` header, one worktree per listed repo is also leased on branch <slug> from its base
(default branch when no @base); the output lists repo, branch, base and path. Existing leases are reused.
  --dry-run       run the preflight, change nothing
  --no-worktree   skip the treehouse lease
Output: worktree path, an enter command to copy, the ready steps with their Owns, and the parallel waves.
Next: run \`change-axi enter <slug> [step]\` to open the agent in the worktree.
examples:
  change-axi start split-auth
`,
};

function repoRows(ws: RepoWorktree[]): Record<string, unknown>[] {
  return ws.map((w) => ({ repo: w.repo, branch: w.branch, base: w.base, path: w.path, native: w.nativePath }));
}

export function startCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(START_SPEC, args);
  const slug = p.pos[0] as string;
  const dry = flagBool(p, "--dry-run");
  const r = startChange(ctx, slug, { dryRun: dry, worktree: !flagBool(p, "--no-worktree") });
  const out: AxiStructuredOutput = {
    start: dry ? `${slug} ready to start (dry run, nothing changed)` : r.already ? `${slug} already in flight` : `${slug} started`,
  };
  if (r.commit) out["commit"] = r.commit;
  if (r.worktree) {
    out["worktree"] = r.worktree.path;
    out["branch"] = slug;
    out["enter"] = r.worktree.name ? `treehouse enter ${r.worktree.name}` : `cd ${r.worktree.path}`;
  }
  if (r.repos) out["repos"] = repoRows(r.repos);
  // Owns lists are long; show them only when parallel work is possible (more than one ready step).
  out["ready"] = r.ready.length > 1 ? r.ready : r.ready.map((x) => ({ id: x.id, owns: `${x.owns.split(",").length} path(s)` }));
  out["waves"] = [...r.waves].map(([w, ids]) => ({ wave: w, steps: ids.join(",") }));
  if (r.warnings.length > 0) out["warnings"] = r.warnings;
  const step = r.ready[0]?.id ?? "<step-id>";
  out["help"] = [
    `Run \`change-axi enter ${slug} ${step}\` to launch your agent in the worktree (omit the step to resume)`,
    ...(r.ready.length > 1 ? ["Ready steps can run in parallel if their Owns do not overlap (see `change-axi check` OVERLAP warnings)"] : []),
  ];
  if (!hasSetupBlock(ctx.root)) (out["help"] as string[]).push(SETUP_HINT);
  return out;
}

// ---------------------------------------------------------------- finish

export const FINISH_SPEC: CmdSpec = {
  name: "finish",
  flags: { "--dry-run": "boolean", "--skip-docs-check": "boolean", "--delete-branch": "boolean" },
  min: 1,
  max: 1,
  usage: "change-axi finish <slug> [--dry-run] [--skip-docs-check] [--delete-branch]",
  help: `usage: change-axi finish <slug> [--dry-run] [--skip-docs-check] [--delete-branch]
Finish a change from the main checkout: archive it on its branch if not yet archived (commit "archive <slug>"),
fast-forward merge the branch into the default branch, and release the treehouse worktree.
Preflight: on the default branch with a clean tree, branch <slug> exists with a worktree, default branch is an ancestor of the branch.
Archive checks apply unchanged (tasks done, Docs impact updated).
Changes with a \`Repos:\` header: every extra repo is checked first (clean worktree and checkout, branch exists, base is an
ancestor); the real finish refuses until all are ready, then ff-merges each extra repo, returns its lease, and finishes the plan repo last.
A rerun skips repos already merged. --dry-run prints a repo table with ahead/behind and the exact rebase command.
  --dry-run          run the preflight and archive checks, change nothing
  --skip-docs-check  pass through to archive
  --delete-branch    after the worktree is returned, delete the merged branch (git branch -d); failure is a warning
examples:
  change-axi finish split-auth --dry-run
  change-axi finish split-auth
`,
};

export function finishCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(FINISH_SPEC, args);
  const slug = p.pos[0] as string;
  const dry = flagBool(p, "--dry-run");
  const r = finishChange(ctx, slug, { dryRun: dry, skipDocsCheck: flagBool(p, "--skip-docs-check"), deleteBranch: flagBool(p, "--delete-branch") });
  const out: AxiStructuredOutput = { finish: dry ? `${slug} ${r.ready === false ? "NOT ready" : "ready"} (dry run, nothing changed)` : `${slug} finished` };
  out["archived"] = r.archived;
  if (r.adrs.length > 0) out["adrs"] = r.adrs;
  if (r.untouched.length > 0) out["docs_not_updated"] = r.untouched.join(", ");
  out["merged"] = r.merged;
  out["returned"] = r.returned;
  if (r.repos) out["repos"] = r.repos;
  if (r.branchDeleted) out["branch_deleted"] = r.branchDeleted;
  if (r.warnings) out["warnings"] = r.warnings;
  if (dry && r.ready === false) out["help"] = ["Fix the repos marked in `detail` (rebase commands are exact), then dry-run again"];
  else if (dry) out["help"] = [`Run \`change-axi finish ${slug}\` to apply`];
  else if (r.buildHint) out["help"] = [r.buildHint];
  return out;
}

// ---------------------------------------------------------------- guidance

/** Appended to the prompt given to the launched agent: stops the habitual `git branch` check. */
const AGENT_PROMPT_HINT = " (orient with bare `change-axi`, it prints branch and worktree; do not run `git branch --show-current`)";

const MODEL_SETUP = `  [apply.agents.small]        # profile: harness required (or command = "... {prompt}")
  harness = "pi"              # only pi is a built-in adapter
  model = "provider/id"       # pi --model
  effort = "low"              # pi --thinking
  [apply.tiers]               # tier (small|standard|deep) -> profile name
  small = "small"
  [propose.tiers]             # plain-language rules plan-propose uses to pick a tier per step
  standard = ["changes that touch db migrations"]
  [propose]
  default_tier = "small"      # optional
Then set a step's tier: change-axi step add ... --tier <t> | change-axi step set <slug> <step> --tier <t>.
change-axi check warns TIER_UNMAPPED when a tier has no profile.
Set this up with \`change-axi config\` instead of editing the file by hand.
pi effort levels: ${PI_THINKING_FALLBACK.join(", ")} (\`change-axi config --verify\` checks them against the installed pi).
Agent choice order: --agent <profile>, the step's tier profile, [apply] agent, CHANGE_AXI_AGENT, then PATH autodetect.`;

export const GUIDANCE_SPEC: CmdSpec = {
  name: "guidance",
  flags: {},
  min: 0,
  max: 0,
  usage: "change-axi guidance",
  help: `usage: change-axi guidance
Show the model-tier rules for steps and the agent profile (with model and effort) each tier maps to. plan-propose uses this to set \`step add --tier\`.
Change it with \`change-axi config\`.
Full model setup in .plan-axi.toml (repo or user config):
${MODEL_SETUP}`,
};

export function guidanceCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  parseArgs(GUIDANCE_SPEC, args);
  const g = loadGuidance(ctx.root);
  const resolved = readPlanConfig(ctx.root).resolved;
  const any = TIERS.some((t) => g.tiers[t].length > 0) || g.default_tier;
  if (!any) {
    return {
      guidance: "none configured",
      help: ["Models are set up in .plan-axi.toml: profiles [apply.agents.<name>] (harness, model, effort), tier map [apply.tiers], rules [propose.tiers], optional [propose] default_tier", "Set it up with `change-axi config` (change-axi guidance --help shows the file format)"],
    };
  }
  return {
    default_tier: g.default_tier ?? "none",
    tiers: TIERS.map((t) => ({ tier: t, profile: tierProfile(ctx.root, t) ?? "-", model: resolved.find((r) => r.tier === t)?.model ?? "-", effort: resolved.find((r) => r.tier === t)?.effort ?? "-", rules: g.tiers[t].length > 0 ? g.tiers[t].join("; ") : "-" })),
    help: ["Set a step's tier with `change-axi step add ... --tier <t>` or `change-axi step set <slug> <step> --tier <t>`", "Change profiles, tiers and rules with `change-axi config`; see `change-axi guidance --help`"],
  };
}

// ---------------------------------------------------------------- setup

export const SETUP_SPEC: CmdSpec = {
  name: "setup",
  flags: { "--file": "string", "--remove": "boolean" },
  min: 0,
  max: 0,
  usage: "change-axi setup [--file <path>] [--remove]",
  help: `usage: change-axi setup [--file <path>] [--remove]
Add a managed block to AGENTS.md telling agents to use plan-apply on a change branch.
Target: --file, else existing AGENTS.md, else existing CLAUDE.md, else a new AGENTS.md.
Only text between <!-- plan-axi:start --> and <!-- plan-axi:end --> is ever touched. Re-running is a no-op.
  --remove   delete the block
examples:
  change-axi setup
  change-axi setup --remove
`,
};

export function setupCommand(ctx: Ctx, args: string[]): AxiStructuredOutput {
  const p = parseArgs(SETUP_SPEC, args);
  const file = flagStr(p, "--file");
  if (flagBool(p, "--remove")) {
    const r = removeSetup(ctx.root, file);
    return { setup: r.changed ? "block removed" : "no block found (nothing changed)", path: r.path };
  }
  const r = applySetup(ctx.root, file);
  return { setup: r.changed ? (r.created ? "file created with block" : "block added") : "block already present (nothing changed)", path: r.path };
}

// ---------------------------------------------------------------- enter

const SETUP_HINT = "Run `change-axi setup` so agents in the worktree know to use plan-apply (adds a block to AGENTS.md)";

export const ENTER_SPEC: CmdSpec = {
  name: "enter",
  flags: { "--print": "boolean", "--run": "boolean", "--list": "boolean", "--agent": "string", "--no-verify": "boolean" },
  min: 0,
  max: 2,
  usage: "change-axi enter [slug] [step] [--print] [--run] [--agent <name>] [--no-verify] | enter --list",
  help: `usage: change-axi enter [slug] [step] [--print] [--run] [--agent <name>] [--no-verify]
       change-axi enter --list
Without a slug: uses the change on the current branch, else the only in-flight change; with several, a TTY gets a
numbered prompt and otherwise the list is printed (exit 1).
Start the change if needed, find its worktree, and run the configured agent there with the prompt "apply <slug> [step]".
Agent command: [apply] agent = "pi {prompt}" in .plan-axi.toml (repo) or the user config, then env CHANGE_AXI_AGENT,
then the first of pi, claude, codex, gemini, opencode found on PATH. Placeholders: {prompt} {slug} {step} {path}.
On branch <slug> the current directory is used. Without a TTY, or with --print, the command is printed, not run.
  --agent   use profile [apply.agents.<name>] (harness, model, effort, command) instead of the default agent
  --print   print the path and command only
  --run     run even when stdout is not a TTY
  --no-verify  skip the live check of the profile's model and effort before launch
  --list    list active changes with worktree, branch state and in-flight steps
examples:
  change-axi enter --list
  change-axi enter split-auth
  change-axi enter split-auth 02-tokens --print
`,
};

export interface PickIO {
  tty: boolean;
  /** Show the prompt and return one line of input, or undefined at EOF. */
  ask: (prompt: string) => string | undefined;
}

function readLineSync(prompt: string): string | undefined {
  process.stderr.write(prompt);
  const buf = Buffer.alloc(1);
  let line = "";
  for (;;) {
    let n: number;
    try {
      n = readSync(0, buf, 0, 1, null);
    } catch {
      return undefined;
    }
    if (n === 0) return line === "" ? undefined : line;
    const ch = buf.toString("utf8");
    if (ch === "\n") return line.replace(/\r$/, "");
    line += ch;
  }
}

/**
 * Slug for a slug-less `enter`: the change on the current branch, the only in-flight change,
 * or a pick among several (TTY: numbered prompt; otherwise a list and exit code 1).
 * Returns a slug, or an output to print instead.
 */
export function resolveEnterSlug(ctx: Ctx, io: PickIO): { slug: string } | { output: AxiStructuredOutput } {
  const current = currentChangeSlug(ctx);
  if (current) return { slug: current };
  const rows = listEnterable(ctx);
  const inFlight = new Set(listTasks(ctx.root, "backlog.md").filter((t) => t.state === "in_flight").map((t) => t.id));
  const flying = rows.filter((r) => inFlight.has(r.slug));
  if (flying.length === 1) return { slug: (flying[0] as { slug: string }).slug };
  const choices = flying.length > 1 ? flying : rows;
  if (choices.length === 0) {
    throw new AxiError("no active changes", "NOT_FOUND", ["Run `change-axi` to see active changes", 'Run `change-axi new <slug> "<title>"` to start a plan']);
  }
  if (!io.tty) {
    process.exitCode = 1;
    return { output: { changes: choices, help: ["Several changes: pass one, `change-axi enter <slug>`", "Run `change-axi enter --list` for details"] } };
  }
  const menu = choices.map((r, i) => `  ${i + 1}) ${r.slug}  worktree=${r.worktree}  in_flight=${r.in_flight}`).join("\n");
  const ans = io.ask(`Active changes:\n${menu}\nPick a change [1-${choices.length}]: `)?.trim();
  const n = Number(ans);
  if (!ans || !Number.isInteger(n) || n < 1 || n > choices.length) {
    throw new AxiError(`no valid choice "${ans ?? ""}"`, "VALIDATION_ERROR", ["Run `change-axi enter <slug>` or `change-axi enter --list`"]);
  }
  return { slug: (choices[n - 1] as { slug: string }).slug };
}

export function enterCommand(ctx: Ctx, args: string[], io: PickIO = { tty: Boolean(process.stdin.isTTY && process.stdout.isTTY), ask: readLineSync }): AxiStructuredOutput {
  const p = parseArgs(ENTER_SPEC, args);
  if (flagBool(p, "--list")) {
    const rows = listEnterable(ctx);
    if (rows.length === 0) return { ...whereAmI(ctx), changes: "0 active changes", help: ['Run `change-axi new <slug> "<title>"` to start a plan'] };
    return { ...whereAmI(ctx), changes: rows, help: ["Run `change-axi enter <slug>` to start or resume one"] };
  }
  let slug = p.pos[0];
  if (!slug) {
    const r = resolveEnterSlug(ctx, io);
    if ("output" in r) return r.output;
    slug = r.slug;
  }
  let step = p.pos[1];
  requireChange(ctx, slug);
  if (step && !listTasks(ctx.root, tasksRel(slug)).some((t) => t.id === step)) {
    throw new AxiError(`no step "${step}" in ${slug}`, "NOT_FOUND", [`Run \`change-axi status ${slug}\` for step ids`]);
  }
  let path = ctx.root;
  let enter: string | undefined;
  let extra: RepoWorktree[] | undefined;
  const out: AxiStructuredOutput = {};
  if (git(ctx, ["branch", "--show-current"], true) !== slug) {
    const inFlight = listTasks(ctx.root, "backlog.md").find((t) => t.id === slug)?.state === "in_flight";
    let w;
    if (inFlight) {
      w = leaseWorktree(ctx, slug);
      extra = leaseRepos(ctx, slug);
    } else {
      const sr = startChange(ctx, slug, { dryRun: false, worktree: true });
      w = sr.worktree;
      extra = sr.repos;
    }
    if (!w) throw new AxiError("no worktree", "TREEHOUSE_ERROR");
    path = w.path;
    enter = w.name ? `treehouse enter ${w.name}` : `cd ${w.path}`;
  } else {
    extra = leaseRepos(ctx, slug);
  }
  const out_: string[] = [];
  if (!step) {
    // Resume: the worktree's branch holds the live step state.
    let flying: string[] = [];
    let ready: string[] = [];
    try {
      const tasks = listTasks(path, tasksRel(slug));
      flying = tasks.filter((t) => t.state === "in_flight").map((t) => t.id);
      ready = readyStepIds(tasks);
    } catch {
      /* no tasks file yet */
    }
    if (flying.length === 1) {
      step = flying[0];
      out_.push(`Resuming in-flight step ${step}`);
    } else if (flying.length === 0 && ready.length === 1) {
      step = ready[0];
    } else if (flying.length === 0 && ready.length > 1) {
      const rows = ready.map((id) => {
        const f = join(path, "specs", "changes", "active", slug, `${id}.md`);
        const tier = (existsSync(f) ? headerLine(readLf(f), "Tier") : undefined) ?? "-";
        return { step: id, tier, profile: (tier !== "-" ? tierProfile(path, tier) : undefined) ?? "-" };
      });
      const listing: AxiStructuredOutput = { worktree: path, branch: slug };
      if (enter) listing["enter"] = enter;
      if (extra && extra.length > 0) listing["repos"] = repoRows(extra);
      listing["ready"] = rows;
      listing["help"] = [
        `Several steps are ready. Run \`change-axi enter ${slug} <step>\` to launch one with its tier profile`,
      ];
      return listing;
    }
  }
  const prompt = step ? `apply ${slug} ${step}` : `apply ${slug}`;
  out["worktree"] = path;
  out["branch"] = slug;
  if (enter) out["enter"] = enter;
  if (extra && extra.length > 0) out["repos"] = repoRows(extra);
  out["prompt"] = prompt;
  const help: string[] = out_;
  const profileName = flagStr(p, "--agent");
  let tierOpts: { tierProfile?: string; tier?: string } = {};
  if (step && profileName === undefined) {
    const stepFile = join(path, "specs", "changes", "active", slug, `${step}.md`);
    const tier = existsSync(stepFile) ? headerLine(readLf(stepFile), "Tier") : undefined;
    const mapped = tier ? tierProfile(path, tier) : undefined;
    if (tier && mapped) tierOpts = { tierProfile: mapped, tier };
  }
  const agent = resolveAgent(path, profileName !== undefined ? { profile: profileName } : tierOpts);
  if (!agent) {
    help.push('No agent found. Set one in .plan-axi.toml: [apply]  agent = "pi {prompt}"  (or export CHANGE_AXI_AGENT)');
    help.push(`Then start your agent in the worktree with: ${prompt}`);
  } else {
    const reposJson = extra && extra.length > 0 ? JSON.stringify(Object.fromEntries(extra.map((w) => [w.repo, w.path]))) : "";
    const vars = { prompt: `${prompt}${AGENT_PROMPT_HINT}`, slug, ...(step ? { step } : {}), path, repos: reposJson };
    const cmd = agent.profile ? buildProfileCommand(agent.profile, vars) : buildCommand(agent.template, vars);
    out["agent"] = agent.profile ? `${agent.profile.name} (${agent.source}${agent.source.startsWith("tier ") ? ` -> ${agent.profile.name}` : ""})` : `${agent.template} (${agent.source})`;
    out["command"] = cmd;
    const tty = Boolean(process.stdout.isTTY);
    const willRun = !(flagBool(p, "--print") || !(tty || flagBool(p, "--run")));
    if (agent.profile && !flagBool(p, "--no-verify")) {
      const results = preflightProfile(agent);
      const bad = results.filter((r) => r.status === "invalid");
      if (bad.length > 0 && willRun) {
        const name = agent.profile.name;
        throw new AxiError(
          `agent profile "${name}" is invalid: ${bad.map((r) => `${r.field}: ${r.message}`).join("; ")}`,
          "VALIDATION_ERROR",
          [`Fix it: change-axi config --profile ${name} --model <provider/id> --effort <level>`, "Launch anyway: change-axi enter ... --no-verify"],
        );
      }
      for (const r of results) {
        if (r.status === "invalid") help.push(`warning: profile ${agent.profile.name} ${r.field}: ${r.message}`);
        else if (r.status === "skipped") help.push(`warning: profile ${agent.profile.name} ${r.field} not verified: ${r.message}`);
      }
    }
    if (!willRun) {
      help.push(flagBool(p, "--print") ? "Printed only (--print)" : "Not a TTY: printed only. Use --run to run anyway");
    } else {
      const code = runAgent(cmd, path, reposJson ? { CHANGE_AXI_REPOS: reposJson } : undefined);
      out["exit"] = code;
      if (code !== 0) process.exitCode = code;
    }
  }
  if (!hasSetupBlock(path)) help.push(SETUP_HINT);
  if (help.length > 0) out["help"] = help;
  return out;
}
