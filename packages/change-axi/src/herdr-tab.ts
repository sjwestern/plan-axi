import { spawnSync } from "node:child_process";

/** Best effort: name the current herdr tab after `label`. Never throws. */
export function renameHerdrTab(label: string, env: NodeJS.ProcessEnv = process.env): void {
  const tabId = env["HERDR_TAB_ID"];
  if (env["HERDR_ENV"] !== "1" || !tabId) return;
  try {
    spawnSync(env["HERDR_BIN_PATH"] || "herdr", ["tab", "rename", tabId, label], { stdio: "ignore", timeout: 2000 });
  } catch {
    /* ignore */
  }
}

/** True inside a herdr pane that has a tab id. */
export function inHerdrTab(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["HERDR_ENV"] === "1" && Boolean(env["HERDR_TAB_ID"]);
}

/**
 * Close the current herdr tab once this process exits (so the command output is printed first).
 * Best effort: errors are ignored.
 */
export function closeHerdrTabOnExit(env: NodeJS.ProcessEnv = process.env): void {
  const tabId = env["HERDR_TAB_ID"];
  if (!inHerdrTab(env) || !tabId) return;
  process.once("exit", () => {
    try {
      spawnSync(env["HERDR_BIN_PATH"] || "herdr", ["tab", "close", tabId], { stdio: "ignore", timeout: 2000 });
    } catch {
      /* ignore */
    }
  });
}
