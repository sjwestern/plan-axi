/** ADRs from other repos named in `[repos.<name>]` with a `docs` key, so plan refs can cite them. */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { adrInfos, type AdrInfo } from "docs-axi/lib/adrrefs";
import { loadConfig } from "docs-axi/lib/config";
import { loadDocs } from "docs-axi/lib/model";
import { readRepoConfigs } from "./planconfig.js";
import { defaultHost, repoRuntime, type HostEnv } from "./repos.js";

export interface SourceAdrs {
  /** ADRs of every available source repo, tagged with the repo name. */
  adrs: AdrInfo[];
  /** Names of source repos whose checkout or docs dir could not be read. */
  unavailable: string[];
}

/**
 * Load ADRs of each configured source repo (a repo with a `docs` key), read from its configured main checkout.
 * The plan repo itself is skipped. A missing checkout or docs dir is reported, never thrown.
 */
export function loadSourceAdrs(planRoot: string, host: HostEnv = defaultHost()): SourceAdrs {
  const out: SourceAdrs = { adrs: [], unavailable: [] };
  for (const cfg of readRepoConfigs(planRoot)) {
    if (cfg.docs === undefined) continue;
    try {
      const root = repoRuntime(cfg, host).path;
      if (resolve(root) === resolve(planRoot)) continue;
      const docsDir = resolve(root, cfg.docs);
      if (!existsSync(docsDir)) {
        out.unavailable.push(cfg.name);
        continue;
      }
      const docs = loadDocs({ root, docsDir, config: loadConfig(root) });
      for (const a of adrInfos(docs)) out.adrs.push({ ...a, repo: cfg.name });
    } catch {
      out.unavailable.push(cfg.name);
    }
  }
  return out;
}
