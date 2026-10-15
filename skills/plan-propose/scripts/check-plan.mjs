#!/usr/bin/env node
// Validate a change folder: task graph (cycles), step file <-> task links,
// and Owns overlap between tasks that can run in parallel.
// Interim home of the future `change-axi check`. Node >= 20, no dependencies.
// usage: node check-plan.mjs <change-dir> [--waves]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const showWaves = args.includes("--waves");
if (!dir) {
  console.log("error: change directory is required");
  console.log("help: node check-plan.mjs specs/changes/active/<slug> [--waves]");
  process.exit(2);
}
const root = resolve(dir);
const tasksFile = join(root, "tasks.md");
const errors = [];
const warnings = [];

if (!existsSync(join(root, "proposal.md"))) errors.push("MISSING_PROPOSAL: proposal.md not found");
if (!existsSync(tasksFile)) {
  console.log(`error: ${tasksFile} not found`);
  process.exit(2);
}

// --- read tasks through tasks-axi (never parse tasks.md directly)
function splitRow(line) {
  const cells = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === "\\") cur += line[++i] ?? "";
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

const bin = process.env.TASKS_AXI ?? "tasks-axi";
let out;
try {
  out = execFileSync(
    bin,
    ["list", "--file", tasksFile, "--fields", "blocked_by,body", "--limit", "1000"],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
} catch (e) {
  console.log(`error: could not run ${bin} list`);
  console.log(String(e.stdout ?? e.message).trim());
  process.exit(1);
}
const lines = out.split("\n");
const headIdx = lines.findIndex((l) => /^tasks\[\d+\]\{/.test(l));
const tasks = [];
if (headIdx >= 0) {
  const cols = /\{(.*)\}/.exec(lines[headIdx])[1].split(",");
  for (let i = headIdx + 1; i < lines.length && lines[i].startsWith("  "); i++) {
    if (/^\s+(-|Run)/.test(lines[i]) && !lines[i].includes(",")) break;
    const cells = splitRow(lines[i].trim());
    if (cells.length !== cols.length) break;
    const t = Object.fromEntries(cols.map((c, j) => [c, cells[j]]));
    t.blockers = t.blocked_by === "none" || t.blocked_by === "" ? [] : t.blocked_by.split(",");
    tasks.push(t);
  }
}
if (tasks.length === 0) errors.push("NO_TASKS: tasks.md has no tasks");

const active = tasks.filter((t) => t.state !== "done");
const ids = new Set(active.map((t) => t.id));

// --- cycles / waves (Kahn). blocked_by from tasks-axi lists active blockers only.
const level = new Map();
const remaining = new Set(ids);
let wave = 1;
while (remaining.size > 0) {
  const ready = [...remaining].filter((id) =>
    active.find((t) => t.id === id).blockers.every((b) => !remaining.has(b)),
  );
  if (ready.length === 0) {
    const cyc = [...remaining].sort();
    errors.push(`CYCLE: tasks can never become ready: ${cyc.join(", ")}. Break it with \`tasks-axi unblock <id> --by <other> --file ${tasksFile}\``);
    break;
  }
  for (const id of ready) {
    level.set(id, wave);
    remaining.delete(id);
  }
  wave++;
}

// --- step files <-> tasks
const stepFiles = readdirSync(root).filter((f) => /^\d{2,}-.+\.md$/.test(f)).sort();
const specOf = new Map();
for (const t of tasks) {
  const m = /Spec:\s*(\S+\.md)/.exec(t.body ?? "");
  if (!m) {
    errors.push(`NO_SPEC: task ${t.id} body has no "Spec: <file>.md"`);
    continue;
  }
  specOf.set(t.id, m[1]);
  if (!existsSync(join(root, m[1]))) errors.push(`SPEC_MISSING: task ${t.id} -> ${m[1]} not found`);
}
const referenced = new Set(specOf.values());
// tasks-axi moves done tasks beyond done_keep (default 10) into done-archive.md next to tasks.md.
const archiveFile = join(root, "done-archive.md");
const archived = existsSync(archiveFile) ? readFileSync(archiveFile, "utf8") : "";
for (const f of stepFiles) {
  const stem = f.replace(/\.md$/, "");
  if (referenced.has(f) || archived.includes(`] ${stem} `)) continue;
  errors.push(`ORPHAN_STEP: ${f} has no task; add one or delete the file`);
}

// --- Owns overlap between tasks that may run in parallel
function owns(file) {
  const p = join(root, file);
  if (!existsSync(p)) return [];
  const m = /^Owns:\s*(.+)$/m.exec(readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter(Boolean)
    .map((s) => s.replace(/[*?[{].*$/, "").replace(/\/+$/, ""));
}
const ownsById = new Map();
for (const t of active) {
  const f = specOf.get(t.id);
  if (!f) continue;
  const o = owns(f);
  if (o === null) warnings.push(`NO_OWNS: ${f} has no "Owns:" line; parallel safety cannot be checked`);
  else ownsById.set(t.id, o);
}
// transitive blocker closure
const blockersOf = new Map(active.map((t) => [t.id, t.blockers.filter((b) => ids.has(b))]));
function ancestors(id, seen = new Set()) {
  for (const b of blockersOf.get(id) ?? []) {
    if (!seen.has(b)) {
      seen.add(b);
      ancestors(b, seen);
    }
  }
  return seen;
}
const related = (a, b) => ancestors(a).has(b) || ancestors(b).has(a);
const overlaps = (x, y) => x === y || x === "" || y === "" || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
const sorted = [...ownsById.keys()].sort();
for (let i = 0; i < sorted.length; i++) {
  for (let j = i + 1; j < sorted.length; j++) {
    const [a, b] = [sorted[i], sorted[j]];
    if (related(a, b)) continue;
    const hit = ownsById.get(a).find((x) => ownsById.get(b).some((y) => overlaps(x, y)));
    if (hit !== undefined) {
      warnings.push(`OVERLAP: ${a} and ${b} can run in parallel but both touch ${hit || "(whole repo)"}; chain them with \`tasks-axi block\``);
    }
  }
}

// --- report
const total = tasks.length;
if (errors.length === 0) {
  console.log(`check: ok (${total} tasks, ${active.length} unfinished, ${stepFiles.length} step files)`);
} else {
  console.log(`check: ${errors.length} error(s)`);
  console.log(`errors[${errors.length}]:`);
  for (const e of errors) console.log(`  - ${e}`);
}
if (warnings.length) {
  console.log(`warnings[${warnings.length}]:`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (showWaves && level.size > 0) {
  const byWave = new Map();
  for (const [id, w] of level) byWave.set(w, [...(byWave.get(w) ?? []), id]);
  console.log("waves (tasks in one wave can run in parallel if Owns do not overlap):");
  for (const w of [...byWave.keys()].sort((a, b) => a - b)) {
    console.log(`  ${w}: ${byWave.get(w).sort().join(", ")}`);
  }
}
process.exit(errors.length ? 1 : 0);
