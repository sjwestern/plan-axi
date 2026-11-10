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
