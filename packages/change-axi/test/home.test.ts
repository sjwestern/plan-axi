import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

let dir: string;
const git = (...a: string[]): string => execFileSync("git", a, { cwd: dir, encoding: "utf8" }).trim();
const run = async (...argv: string[]): Promise<string> => {
  let out = "";
  process.exitCode = undefined;
  await main({ argv, cwd: dir, stdout: { write: (c: string) => ((out += c), true) } });
  process.exitCode = undefined;
  return out;
};
const P = "demo-change";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "change-axi-home-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  await run("new", P, "Demo change");
  await run("step", "add", P, "Do it", "--owns", "src/");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("home", () => {
  it("lists active changes on main", async () => {
    const out = await run();
    expect(out).toContain("changes");
    expect(out).toContain(P);
    expect(out).not.toContain(`apply ${P}`);
  });

  it("shows the change on its branch", async () => {
    git("checkout", "-q", "-b", P);
    const out = await run();
    expect(out).toContain(`change: ${P}`);
    expect(out).toContain("01-do-it");
    expect(out).toContain(`apply ${P} 01-do-it`);
  });

  it("shows the generic home on an unrelated branch", async () => {
    git("checkout", "-q", "-b", "other");
    expect(await run()).toContain("changes");
  });
});
