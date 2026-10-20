import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AxiError } from "axi-sdk-js";
import { activeDir, getDocsConfig, requireChange, type Ctx } from "./change.js";
import { guardAdrs } from "./adrguard.js";
import { checkChange } from "./check.js";
import { commitHeader, commitStyle } from "./commitstyle.js";
import { commit, git } from "./git.js";

export interface CommitPlanOptions {
  reason?: string;
  dryRun?: boolean;
}

export interface CommitPlanResult {
  slug: string;
  message: string;
  paths: string[];
  files: string[];
  commit?: string;
  warnings: string[];
}

const porcelainFiles = (out: string): string[] => out.split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "").replace(/^.* -> /, ""));

/** Active change whose folder has uncommitted entries; errors unless exactly one. */
function detectSlug(ctx: Ctx): string {
  const dir = activeDir(ctx);
  const slugs = existsSync(dir) ? readdirSync(dir).sort() : [];
  const dirty = slugs.filter((s) => git(ctx, ["status", "--porcelain", "-uall", "--", `specs/changes/active/${s}`]) !== "");
  if (dirty.length === 1) return dirty[0] as string;
  if (dirty.length === 0) throw new AxiError("nothing to commit: no active plan has uncommitted changes", "NOTHING_TO_COMMIT", ["Pass a slug to commit an amendment or docs-only changes"]);
  throw new AxiError(`${dirty.length} plans have uncommitted changes: ${dirty.join(", ")}`, "VALIDATION_ERROR", ["Pass the slug: `change-axi commit-plan <slug>`"]);
}

/** Commit the plan folder, backlog.md and the docs dir. Never stages other paths. */
export function commitPlan(ctx: Ctx, slugArg: string | undefined, o: CommitPlanOptions = {}): CommitPlanResult {
  const slug = slugArg ?? detectSlug(ctx);
  requireChange(ctx, slug);
  const chk = checkChange(ctx, slug);
  if (chk.errors.length > 0) throw new AxiError("plan check failed", "VALIDATION_ERROR", chk.errors.concat(`Run \`change-axi check ${slug}\``));

  guardAdrs(ctx, `change-axi commit-plan ${slug}`);

  const docsDir = getDocsConfig(ctx).layout.dir;
  const paths = [`specs/changes/active/${slug}`, "backlog.md", ".tasks.toml", docsDir].filter((p) => existsSync(join(ctx.root, p)));
  const style = commitStyle(ctx.root);
  const subject = o.reason && o.reason.trim() !== "" ? o.reason.trim() : `propose ${slug}`;
  const header = commitHeader(style.planType, style.scope, subject);
  const message = style.trailer === "" ? header : `${header}\n\n${style.trailer}: ${slug}`;

  // raw: trimming would strip the leading space of the first porcelain line (" M file") and corrupt its path
  const status = git(ctx, ["status", "--porcelain", "-uall"], false, true);
  const isPlan = (f: string): boolean => paths.some((p) => f === p || f.startsWith(`${p}/`));
  const all = porcelainFiles(status);
  const files = all.filter(isPlan);
  const others = all.filter((f) => !isPlan(f));
  const warnings = others.length > 0 ? [`Not committed (outside the plan): ${others.slice(0, 10).join(", ")}${others.length > 10 ? ` (+${others.length - 10} more)` : ""}`] : [];
  if (files.length === 0) throw new AxiError(`nothing to commit for ${slug}`, "NOTHING_TO_COMMIT", ["Plan, backlog.md and docs are already committed"]);
  if (o.dryRun) return { slug, message, paths, files, warnings };

  git(ctx, ["add", "--", ...paths]);
  try {
    commit(ctx, subject, slug, paths, style.planType);
  } catch (e) {
    git(ctx, ["reset", "-q", "--", ...paths], true);
    throw e;
  }
  return { slug, message, paths, files, commit: git(ctx, ["rev-parse", "--short", "HEAD"]), warnings };
}
