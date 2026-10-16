import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

function tryTreehouse(ctx: Ctx, args: string[]): string {
  try {
    return execFileSync("treehouse", args, { cwd: ctx.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new AxiError("treehouse not found on PATH", "NOT_FOUND", ["Install treehouse, or pass --no-worktree and create the worktree yourself"]);
    throw new AxiError(`treehouse ${args[0]} failed: ${(err.stderr ?? "").trim().split("\n").filter((l) => !/new version|treehouse update/i.test(l))[0] ?? ""}`, "TREEHOUSE_ERROR");
  }
}

/** Rows of `treehouse status`: slot name, path and branch label. */
function statusRows(ctx: Ctx): { name: string; path: string; branch?: string }[] {
  const out = tryTreehouse(ctx, ["status"]);
  const rows: { name: string; path: string; branch?: string }[] = [];
  for (const line of out.split("\n")) {
    const m = /^(\d+)\s+\S+\s+(\/\S*|[A-Za-z]:\\\S*)(?:\s+\[([^\]]+)\])?/.exec(line.trim());
    if (m) rows.push({ name: m[1] as string, path: m[2] as string, ...(m[3] ? { branch: m[3] } : {}) });
  }
  return rows;
}

function leaseWorktree(ctx: Ctx, slug: string): Worktree {
  const existing = statusRows(ctx).find((r) => r.branch === slug);
  if (existing) return { path: existing.path, name: existing.name, reused: true };
  const raw = tryTreehouse(ctx, ["get", "--lease", "--json", "-b", slug]);
  let path: string;
  try {
    path = (JSON.parse(raw) as { path: string }).path;
  } catch {
    throw new AxiError("could not read treehouse lease output", "TREEHOUSE_ERROR", [raw.slice(0, 200)]);
  }
  const row = statusRows(ctx).find((r) => r.path === path);
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
