import { execFileSync } from "node:child_process";
import { AxiError } from "axi-sdk-js";
import type { Ctx } from "./change.js";

export function git(ctx: Ctx, args: string[], allowFail = false): string {
  try {
    return execFileSync("git", args, { cwd: ctx.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
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
