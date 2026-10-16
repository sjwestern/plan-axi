import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { requireChange, type Ctx } from "./change.js";
import { checkChange } from "./check.js";
import { defaultBranch, firstCommitOf, git } from "./git.js";
import { listTasks, runTasks } from "./tasks.js";

export interface StartOptions {
  dryRun: boolean;
  worktree: boolean;
}

export interface Worktree {
  path: string;
  name?: string;
  reused: boolean;
}

export interface StartReport {
  already: boolean;
  commit?: string;
  worktree?: Worktree;
  ready: { id: string; owns: string }[];
  waves: Map<number, string[]>;
  warnings: string[];
}

export function tryTreehouse(ctx: Ctx, args: string[]): string {
  try {
    return execFileSync("treehouse", args, { cwd: ctx.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new AxiError("treehouse not found on PATH", "NOT_FOUND", ["Install treehouse, or pass --no-worktree and create the worktree yourself"]);
    throw new AxiError(`treehouse ${args[0]} failed: ${(err.stderr ?? "").trim().split("\n").filter((l) => l.trim() && !/new version|treehouse update|setting up worktree/i.test(l)).slice(-3).join(" | ")}`, "TREEHOUSE_ERROR");
  }
}

/** Rows of `treehouse status` output: slot name, path (`~` expanded) and branch label. */
export function parseStatusRows(out: string, home: string = homedir()): { name: string; path: string; branch?: string }[] {
  const rows: { name: string; path: string; branch?: string }[] = [];
  for (const line of out.split("\n")) {
    const m = /^(\d+)\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const branch = /\[([^\]]+)\]\s*$/.exec(m[2] as string)?.[1];
    const raw = /(~?\/\S*|[A-Za-z]:\\\S*)/.exec(m[2] as string)?.[1];
    const path = raw?.startsWith("~/") ? join(home, raw.slice(2)) : raw;
    if (path) rows.push({ name: m[1] as string, path, ...(branch ? { branch } : {}) });
  }
  return rows;
}

export function statusRows(ctx: Ctx): { name: string; path: string; branch?: string }[] {
  return parseStatusRows(tryTreehouse(ctx, ["status"]));
}

export function leaseWorktree(ctx: Ctx, slug: string): Worktree {
  const existing = statusRows(ctx).find((r) => r.branch === slug);
  if (existing) return { path: existing.path, name: existing.name, reused: true };
  // Branch may already exist (e.g. from an earlier aborted enter).
  const exists = git(ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${slug}`], true) !== "";
  let reuseBranch = false;
  if (exists) {
    const base = defaultBranch(ctx);
    const unique = git(ctx, ["rev-list", "--count", `${base}..${slug}`], true);
    if (!/^\d+$/.test(unique)) {
      throw new AxiError(`branch ${slug} exists but could not be compared with ${base}`, "VALIDATION_ERROR", [
        `Check with \`git log ${base}..${slug}\``,
        `If it holds nothing you need: \`git branch -D ${slug}\`, then rerun enter`,
        `If it holds work: \`git switch ${slug}\` in a free worktree`,
      ]);
    }
    if (unique === "0") git(ctx, ["branch", "-D", slug]); // no unique commits: safe to recreate from base
    else reuseBranch = true; // has work: check it out in the leased worktree
  }
  const raw = tryTreehouse(ctx, reuseBranch ? ["get", "--lease", "--json"] : ["get", "--lease", "--json", "-b", slug]);
  let path: string;
  try {
    path = (JSON.parse(raw) as { path: string }).path;
  } catch {
    throw new AxiError("could not read treehouse lease output", "TREEHOUSE_ERROR", [raw.slice(0, 200)]);
  }
  if (reuseBranch) {
    try {
      execFileSync("git", ["switch", slug], { cwd: path, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      const m = ((e as { stderr?: Buffer }).stderr ?? "").toString().trim().split("\n")[0];
      throw new AxiError(`git switch ${slug} failed in ${path}: ${m}`, "GIT_ERROR", ["Branch may be checked out elsewhere"]);
    }
  }
  // Match by path, then by branch label (the path can differ through symlinks).
  const rows = statusRows(ctx);
  const row = rows.find((r) => r.path === path) ?? rows.find((r) => r.branch === slug);
  return { path, ...(row ? { name: row.name } : {}), reused: false };
}

export function startChange(ctx: Ctx, slug: string, o: StartOptions): StartReport {
  const dir = requireChange(ctx, slug);
  const base = defaultBranch(ctx);
  const current = git(ctx, ["branch", "--show-current"]);
  if (current !== base) {
    throw new AxiError(`on branch "${current}", start runs on ${base}`, "VALIDATION_ERROR", [
      current === slug ? `Already in the change branch. Run \`change-axi status ${slug}\` and execute steps` : `git switch ${base}`,
    ]);
  }
  const upstream = git(ctx, ["rev-parse", "--abbrev-ref", "@{u}"], true);
  if (upstream !== "" && Number(git(ctx, ["rev-list", "--count", `HEAD..${upstream}`], true) || "0") > 0) {
    throw new AxiError(`${base} is behind ${upstream}`, "VALIDATION_ERROR", ["Pull first so the plan you start is current"]);
  }
  const dirty = git(ctx, ["status", "--porcelain", "--", `specs/changes/active/${slug}`, "backlog.md", "docs"]);
  if (dirty !== "") {
    throw new AxiError("plan not committed/clean", "VALIDATION_ERROR", dirty.split("\n").slice(0, 10).concat("Commit the plan on main first"));
  }
  if (!firstCommitOf(ctx, `specs/changes/active/${slug}/proposal.md`)) {
    throw new AxiError("proposal.md is not committed", "VALIDATION_ERROR", ["Commit the plan on main first"]);
  }
  const chk = checkChange(ctx, slug);
  if (chk.errors.length > 0) throw new AxiError("plan check failed", "VALIDATION_ERROR", chk.errors.concat(`Run \`change-axi check ${slug}\``));

  const backlog = listTasks(ctx.root, "backlog.md").find((t) => t.id === slug);
  if (!backlog) throw new AxiError(`backlog.md has no task "${slug}"`, "NOT_FOUND", ["Plans are queued by `change-axi new`"]);
  if (backlog.state === "done") throw new AxiError(`"${slug}" is already done in the backlog`, "VALIDATION_ERROR", ["Archive it, or pick a new slug"]);
  const already = backlog.state === "in_flight";

  const ready = chk.active
    .filter((t) => t.state === "queued" && t.blockers.length === 0)
    .map((t) => {
      const spec = /Spec:\s*(\S+\.md)/.exec(t.body)?.[1];
      let owns = "-";
      if (spec) {
        const text = require_(dir, spec);
        owns = /^Owns:[ \t]*(.*)$/m.exec(text)?.[1]?.trim() ?? "-";
      }
      return { id: t.id, owns };
    });
  const report: StartReport = { already, ready, waves: chk.waves, warnings: chk.warnings };
  if (o.dryRun) return report;

  if (!already) {
    runTasks(ctx.root, ["start", slug, "--file", "backlog.md"]);
    git(ctx, ["add", "--", "backlog.md"]);
    git(ctx, ["commit", "-q", "-m", `start ${slug}`, "--", "backlog.md"]);
    report.commit = git(ctx, ["rev-parse", "--short", "HEAD"]);
  }
  if (o.worktree) report.worktree = leaseWorktree(ctx, slug);
  return report;
}

function require_(dir: string, file: string): string {
  return readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n");
}
