import { execFileSync } from "node:child_process";
import { AxiError } from "axi-sdk-js";
import type { Ctx } from "./change.js";
import { commitHeader, commitStyle } from "./commitstyle.js";

export function git(ctx: Ctx, args: string[], allowFail = false, raw = false): string {
  try {
    const out = execFileSync("git", args, { cwd: ctx.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return raw ? out : out.trim();
  } catch (e) {
    if (allowFail) return "";
    const err = e as { stderr?: string; message?: string };
    throw new AxiError(`git ${args[0]} failed: ${(err.stderr ?? err.message ?? "").trim().split("\n")[0]}`, "GIT_ERROR");
  }
}

export function defaultBranch(ctx: Ctx): string {
  const head = git(ctx, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], true);
  if (head.startsWith("origin/")) return head.slice(7);
  for (const b of ["main", "master"]) if (git(ctx, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`], true)) return b;
  return "main";
}

export function isAncestor(ctx: Ctx, ref: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ref, "HEAD"], { cwd: ctx.root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Commit that first added `path`, or undefined when never committed. */
export function firstCommitOf(ctx: Ctx, path: string): string | undefined {
  return git(ctx, ["log", "--diff-filter=A", "--format=%H", "--", path]).split("\n").filter(Boolean).pop();
}

export function isAncestorOf(ctx: Ctx, a: string, b: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", a, b], { cwd: ctx.root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Commit with a conventional header `type(scope): subject` and a `Trailer: slug` line.
 * `type` defaults to the configured tool type. Hook rejections throw `commit rejected` with stderr details.
 */
export function commit(ctx: Ctx, subject: string, slug: string, paths?: string[], type?: string): void {
  const style = commitStyle(ctx.root);
  const args = ["commit", "-q", "-m", commitHeader(type ?? style.type, style.scope, subject, slug)];
  if (style.trailer !== "") args.push("-m", `${style.trailer}: ${slug}`);
  if (paths) args.push("--", ...paths);
  try {
    execFileSync("git", args, { cwd: ctx.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const text = `${err.stderr ?? ""}\n${err.stdout ?? ""}`.trim() || (err.message ?? "");
    const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
    throw new AxiError("commit rejected", "GIT_ERROR", lines.slice(0, 15));
  }
}
