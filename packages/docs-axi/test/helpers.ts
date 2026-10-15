import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";

export interface Run {
  out: string;
  code: number;
}

export function tempRepo(): { dir: string; run: (...argv: string[]) => Promise<Run>; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "docs-axi-"));
  mkdirSync(join(dir, ".git"));
  process.env["XDG_CONFIG_HOME"] = join(dir, ".no-user-config");
  const run = async (...argv: string[]): Promise<Run> => {
    let out = "";
    process.exitCode = undefined;
    await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
    const code = typeof process.exitCode === "number" ? process.exitCode : 0;
    process.exitCode = undefined;
    return { out, code };
  };
  return { dir, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
