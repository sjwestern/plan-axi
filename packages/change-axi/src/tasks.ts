import { execFileSync } from "node:child_process";
import { AxiError } from "axi-sdk-js";

export const TASKS_AXI_VERSION = "0.2.6";

export interface Task {
  id: string;
  state: string;
  title: string;
  body: string;
  /** Active blockers only (tasks-axi omits done ones). */
  blockers: string[];
}

export function runTasks(cwd: string, args: string[]): string {
  const bin = process.env["TASKS_AXI"] ?? "tasks-axi";
  const tryRun = (cmd: string, a: string[]): string =>
    execFileSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
  try {
    return tryRun(bin, args);
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    if (err.code === "ENOENT") {
      try {
        return tryRun("npx", ["-y", `tasks-axi@${TASKS_AXI_VERSION}`, ...args]);
      } catch (e2) {
        throw tasksError(args, e2);
      }
    }
    throw tasksError(args, e);
  }
}

function tasksError(args: string[], e: unknown): AxiError {
  const err = e as { stdout?: string; stderr?: string; message?: string };
  const text = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || (err.message ?? "unknown error");
  return new AxiError(`tasks-axi ${args[0]} failed: ${text.split("\n")[0]}`, "TASKS_AXI_ERROR", [text.slice(0, 500)]);
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
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

export function listTasks(cwd: string, file: string, extra: string[] = []): Task[] {
  const out = runTasks(cwd, ["list", "--file", file, "--fields", "blocked_by,body", "--limit", "1000", ...extra]);
  const lines = out.split("\n");
  const head = lines.findIndex((l) => /^tasks\[\d+\]\{/.test(l));
  if (head < 0) return [];
  const cols = ((/\{(.*)\}/.exec(lines[head] as string) as RegExpExecArray)[1] as string).split(",");
  const tasks: Task[] = [];
  for (let i = head + 1; i < lines.length && (lines[i] as string).startsWith("  "); i++) {
    const cells = splitRow((lines[i] as string).trim());
    if (cells.length !== cols.length) break;
    const t = Object.fromEntries(cols.map((c, j) => [c, cells[j] as string])) as Record<string, string>;
    const bb = t["blocked_by"] ?? "none";
    tasks.push({
      id: t["id"] as string,
      state: t["state"] as string,
      title: t["title"] ?? "",
      body: t["body"] ?? "",
      blockers: bb === "none" || bb === "" ? [] : bb.split(","),
    });
  }
  return tasks;
}
