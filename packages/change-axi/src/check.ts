import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { splitDoc } from "docs-axi/lib/sectionedit";
import { sectionText, findSectionOrUndefined } from "docs-axi/lib/sections";
import { activeDir, archivedDir, backlogSlugs, changeDir, getDocsConfig, headerLine, parseRepos, readLf, splitList, splitOwnsRepo, stepFiles, tasksRel, TOOL_DIRS, SLUG_RE, MAX_SLUG, type Ctx } from "./change.js";
import { adrInfos, checkRefs, type AdrInfo } from "docs-axi/lib/adrrefs";
import { loadDocs } from "docs-axi/lib/model";
import { PROPOSAL_SECTIONS, STEP_SECTIONS, TIERS, tierProfile, tiersConfigured } from "./spec.js";
import { loadProfiles } from "./agent.js";
import { readRepoConfigs } from "./planconfig.js";
import { listTasks, type Task } from "./tasks.js";

export interface CheckResult {
  errors: string[];
  warnings: string[];
  tasks: Task[];
  active: Task[];
  waves: Map<number, string[]>;
  steps: number;
}

/** Waves by Kahn's algorithm over active blockers. `cycle` lists tasks that can never become ready. */
export function computeWaves(active: Task[]): { waves: Map<number, string[]>; cycle: string[] } {
  const remaining = new Set(active.map((t) => t.id));
  const waves = new Map<number, string[]>();
  let wave = 1;
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => (active.find((t) => t.id === id) as Task).blockers.every((b) => !remaining.has(b)));
    if (ready.length === 0) return { waves, cycle: [...remaining].sort() };
    waves.set(wave, ready.sort());
    for (const id of ready) remaining.delete(id);
    wave++;
  }
  return { waves, cycle: [] };
}

function pathRoot(s: string): string {
  return s.replace(/[*?[{].*$/, "").replace(/\/+$/, "");
}

const overlaps = (x: string, y: string): boolean => x === y || x === "" || y === "" || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);

function filled(text: string, name: string): "ok" | "missing" | "empty" {
  const d = splitDoc(text);
  const s = findSectionOrUndefined(d.secs.filter((x) => x.level === 2), name);
  if (!s) return "missing";
  return sectionText(d.lines, s, true).trim() === "" ? "empty" : "ok";
}

function sectionErrors(errors: string[], file: string, text: string, req: { name: string }[], kind: string): void {
  const missing = req.filter((s) => filled(text, s.name) === "missing").map((s) => s.name);
  const empty = req.filter((s) => filled(text, s.name) === "empty").map((s) => s.name);
  if (missing.length > 0) errors.push(`MISSING_SECTION: ${file}: ${missing.join("; ")} (required, see \`change-axi spec ${kind}\`)`);
  if (empty.length > 0) errors.push(`EMPTY_SECTION: ${file}: ${empty.join("; ")} (write them with \`change-axi write\`)`);
}

export function checkChange(ctx: Ctx, slug: string): CheckResult {
  const dir = changeDir(ctx, slug);
  const errors: string[] = [];
  const warnings: string[] = [];
  const tasksFile = join(dir, "tasks.md");
  const proposalPath = join(dir, "proposal.md");
  const hasProposal = existsSync(proposalPath);
  if (!hasProposal) errors.push("MISSING_PROPOSAL: proposal.md not found");
  const tasks = existsSync(tasksFile) ? listTasks(ctx.root, tasksRel(slug)) : [];
  if (tasks.length === 0) errors.push("NO_TASKS: tasks.md has no tasks (add steps with `change-axi step add`)");
  const active = tasks.filter((t) => t.state !== "done");
  const ids = new Set(active.map((t) => t.id));

  const { waves, cycle } = computeWaves(active);
  if (cycle.length > 0) {
    errors.push(`CYCLE: tasks can never become ready: ${cycle.join(", ")}. Break it with \`change-axi dep ${slug} <step> --off <other>\``);
  }

  // step files <-> tasks
  const steps = stepFiles(dir);
  const specOf = new Map<string, string>();
  for (const t of tasks) {
    const m = /Spec:\s*(\S+\.md)/.exec(t.body);
    if (!m) {
      errors.push(`NO_SPEC: task ${t.id} body has no "Spec: <file>.md"`);
      continue;
    }
    specOf.set(t.id, m[1] as string);
    if (!existsSync(join(dir, m[1] as string))) errors.push(`SPEC_MISSING: task ${t.id} -> ${m[1]} not found`);
  }
  const referenced = new Set(specOf.values());
  const archiveFile = join(dir, "done-archive.md");
  const archivedText = existsSync(archiveFile) ? readFileSync(archiveFile, "utf8") : "";
  for (const f of steps) {
    const stem = f.replace(/\.md$/, "");
    if (referenced.has(f) || archivedText.includes(`] ${stem} `)) continue;
    errors.push(`ORPHAN_STEP: ${f} has no task; add one (change-axi step add) or delete the file`);
  }

  // slug identity
  if (!SLUG_RE.test(slug) || slug.length > MAX_SLUG) errors.push(`BAD_SLUG: "${slug}" must be kebab-case (a-z, 0-9, dashes), max ${MAX_SLUG} chars`);
  if (existsSync(archivedDir(ctx))) {
    const hit = readdirSync(archivedDir(ctx)).find((d) => /^\d{4}-\d{2}-\d{2}-/.test(d) && d.slice(11) === slug);
    if (hit) errors.push(`SLUG_ARCHIVED: slug "${slug}" already used by archived/${hit}; pick a new slug`);
  }
  if (existsSync(join(ctx.root, "backlog.md"))) {
    try {
      if (listTasks(ctx.root, "backlog.md", ["--state", "done"]).some((t) => t.id === slug)) {
        errors.push(`SLUG_DONE: backlog.md already has "${slug}" as done; archive that change or rename this one`);
      }
    } catch {
      warnings.push("BACKLOG_UNREADABLE: could not run tasks-axi list on backlog.md; slug reuse not checked");
    }
  }

  // sections: required, non-empty
  const proposalText = hasProposal ? readLf(proposalPath) : "";
  if (hasProposal) {
    sectionErrors(errors, "proposal.md", proposalText, PROPOSAL_SECTIONS, "proposal");
    const stepsText = splitDoc(proposalText);
    const sec = findSectionOrUndefined(stepsText.secs, "Steps");
    if (sec) {
      const body = sectionText(stepsText.lines, sec, true);
      for (const f of steps) if (!body.includes(f)) warnings.push(`STEP_NOT_LISTED: proposal "Steps" does not mention ${f}`);
    }
  }
  const listed = new Set(parseRepos(proposalText).map((r) => r.name));
  if (listed.size > 0) {
    const configured = new Set(readRepoConfigs(ctx.root).map((r) => r.name));
    for (const name of listed) {
      if (!configured.has(name)) errors.push(`REPO_UNKNOWN: proposal.md Repos lists "${name}" but .plan-axi.toml has no [repos.${name}] (define it with path = "~/..."; or drop it: \`change-axi proposal set ${slug} --repos ${[...listed].filter((n) => n !== name).join(",") || "none"}\`)`);
    }
  }
  const owns = new Map<string, string[]>();
  for (const f of steps) {
    const text = readLf(join(dir, f));
    sectionErrors(errors, f, text, STEP_SECTIONS, "step");
    const tier = headerLine(text, "Tier");
    if (tier !== undefined && tier !== "") {
      if (!(TIERS as readonly string[]).includes(tier)) {
        warnings.push(`TIER_UNKNOWN: ${f} has Tier "${tier}"; use ${TIERS.join(", ")}`);
      } else if (tiersConfigured(ctx.root)) {
        const prof = tierProfile(ctx.root, tier);
        let defined: string[] = [];
        try {
          defined = loadProfiles(ctx.root).map((x) => x.name);
        } catch {
          /* bad profile config surfaces at enter */
        }
        if (!prof) warnings.push(`TIER_UNMAPPED: ${f} has Tier "${tier}" but [apply.tiers] has no "${tier}" entry`);
        else if (!defined.includes(prof)) warnings.push(`TIER_UNMAPPED: ${f} Tier "${tier}" maps to undefined profile "${prof}"`);
      }
    }
    const ownsLine = headerLine(text, "Owns");
    if (ownsLine === undefined || splitList(ownsLine).length === 0) {
      warnings.push(`NO_OWNS: ${f} has no "Owns:" paths; parallel safety cannot be checked`);
    } else {
      const list = splitList(ownsLine);
      owns.set(f, list.map(pathRoot));
      for (const repo of new Set(list.map((e) => splitOwnsRepo(e).repo))) {
        if (repo !== undefined && !listed.has(repo)) errors.push(`OWNS_REPO_UNLISTED: ${f} Owns uses "${repo}:" but proposal.md has no "${repo}" in its Repos header (fix: \`change-axi proposal set ${slug} --repos ${[...listed, repo].join(",")}\`)`);
      }
      for (const e of list) {
        if (!TOOL_DIRS.some((d) => e === d || e.startsWith(`${d}/`))) continue;
        if (!proposalText.includes(e) && !proposalText.includes(pathRoot(e))) {
          errors.push(`OWNS_TOOL_DIR: ${f} edits ${e} (tool-owned dir) but proposal.md never mentions it. Name it in the proposal, or move it from Owns to Docs`);
        }
      }
    }
  }

  // references to other changes: `change:<slug>` must resolve; paths should be slugs
  const known = new Set<string>([...backlogSlugs(ctx), slug]);
  for (const d of [activeDir(ctx), archivedDir(ctx)]) {
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d)) known.add(d === archivedDir(ctx) && /^\d{4}-\d{2}-\d{2}-/.test(n) ? n.slice(11) : n);
  }
  let adrs: AdrInfo[] = [];
  try {
    const config = getDocsConfig(ctx);
    const docsDir = resolve(ctx.root, config.layout.dir);
    if (existsSync(docsDir)) adrs = adrInfos(loadDocs({ root: ctx.root, docsDir, config }));
  } catch {
    warnings.push("ADR_REFS_UNCHECKED: could not load docs; ADR refs not checked");
  }
  const refFiles = [...(hasProposal ? ["proposal.md"] : []), ...steps];
  for (const f of refFiles) {
    const text = f === "proposal.md" ? proposalText : readLf(join(dir, f));
    for (const p of checkRefs(text, adrs)) errors.push(`${p.code}: ${f}: ${p.detail}`);
    const bad = new Set<string>();
    for (const m of text.matchAll(/(?<![\w-])change:([a-z0-9][a-z0-9-]*)/g)) {
      const ref = m[1] as string;
      if (!known.has(ref)) bad.add(ref);
    }
    for (const ref of bad) errors.push(`UNKNOWN_CHANGE_REF: ${f}: change:${ref} matches no active, archived or backlog slug`);
    const paths = new Set<string>();
    for (const m of text.matchAll(/specs\/changes\/(?:active|archived)\/([a-z0-9][^\s`)\]'"<>]*)/g)) paths.add(`specs/changes/${m[0].slice("specs/changes/".length)}`);
    for (const pth of paths) warnings.push(`CHANGE_PATH_REF: ${f}: ${pth}; archive moves changes, refer to them by slug with change:<slug>`);
  }

  // Owns overlap for tasks that may run in parallel
  const blockersOf = new Map(active.map((t) => [t.id, t.blockers.filter((b) => ids.has(b))]));
  const ancestors = (id: string, seen = new Set<string>()): Set<string> => {
    for (const b of blockersOf.get(id) ?? []) if (!seen.has(b)) (seen.add(b), ancestors(b, seen));
    return seen;
  };
  const ownsById = new Map<string, string[]>();
  for (const t of active) {
    const f = specOf.get(t.id);
    const o = f ? owns.get(f) : undefined;
    if (o) ownsById.set(t.id, o);
  }
  const sorted = [...ownsById.keys()].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i] as string;
      const b = sorted[j] as string;
      if (ancestors(a).has(b) || ancestors(b).has(a)) continue;
      const hit = (ownsById.get(a) as string[]).find((x) => (ownsById.get(b) as string[]).some((y) => overlaps(x, y)));
      if (hit !== undefined) warnings.push(`OVERLAP: ${a} and ${b} can run in parallel but both touch ${hit || "(whole repo)"}; chain them with \`change-axi dep ${slug} ${a} --on ${b}\``);
    }
  }
  return { errors, warnings, tasks, active, waves, steps: steps.length };
}
