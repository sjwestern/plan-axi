#!/usr/bin/env node
// Link skills/* into an agent skills dir (default ~/.agents/skills).
// Usage: node scripts/install-skills.mjs [--uninstall] [--dir <path>]
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "skills");
const args = process.argv.slice(2);
const uninstall = args.includes("--uninstall");
const di = args.indexOf("--dir");
const dest = resolve(di >= 0 ? args[di + 1] : join(homedir(), ".agents", "skills"));

const skills = readdirSync(src, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(src, d.name, "SKILL.md")))
  .map((d) => d.name);

if (!uninstall) mkdirSync(dest, { recursive: true });
let failed = false;
for (const name of skills) {
  const target = join(src, name);
  const link = join(dest, name);
  let st;
  try { st = lstatSync(link); } catch {}
  const ours = st?.isSymbolicLink() && resolve(dest, readlinkSync(link)) === target;
  if (uninstall) {
    if (ours) { rmSync(link); console.log(`removed  ${link}`); }
    else if (st) console.log(`skipped  ${link} (not our link)`);
    continue;
  }
  if (ours) { console.log(`ok       ${link}`); continue; }
  if (st) {
    console.error(`conflict ${link} exists and is not a link to ${target}`);
    failed = true;
    continue;
  }
  symlinkSync(target, link, "junction");
  console.log(`linked   ${link} -> ${target}`);
}
process.exit(failed ? 1 : 0);
