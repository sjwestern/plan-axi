import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";

export function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "change-axi-"));
  mkdirSync(join(dir, ".git"));
  const run = async (...argv: string[]): Promise<{ out: string; code: number }> => {
    let out = "";
    process.exitCode = undefined;
    await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
    const code = typeof process.exitCode === "number" ? process.exitCode : 0;
    process.exitCode = undefined;
    return { out, code };
  };
  return { dir, run, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
