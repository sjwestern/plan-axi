import { AxiError } from "axi-sdk-js";
import { loadRawConfig } from "docs-axi/lib/config";

export interface CommitStyle {
  type: string;
  planType: string;
  scope: string;
  trailer: string;
}

const WORD = /^[a-z0-9-]+$/;
const TOKEN = /^[A-Za-z][A-Za-z0-9-]*$/;

/** Commit style from `[commit]` config (repo over user), with defaults. */
export function commitStyle(root: string): CommitStyle {
  const raw = loadRawConfig(root);
  const get = (key: string, def: string, re: RegExp, allowEmpty: boolean): string => {
    const k = `commit.${key}`;
    if (!(k in raw)) return def;
    const v = raw[k];
    if (typeof v !== "string" || (v === "" ? !allowEmpty : !re.test(v))) {
      throw new AxiError(`invalid ${k} in .plan-axi.toml or user config: ${JSON.stringify(v)}`, "VALIDATION_ERROR", [
        allowEmpty ? `${k} must match ${re} or be empty` : `${k} must match ${re}`,
      ]);
    }
    return v;
  };
  return {
    type: get("type", "chore", WORD, false),
    planType: get("plan_type", "docs", WORD, false),
    scope: get("scope", "plan", WORD, true),
    trailer: get("trailer", "Change", TOKEN, true),
  };
}

export function commitHeader(type: string, scope: string, subject: string): string {
  return scope === "" ? `${type}: ${subject}` : `${type}(${scope}): ${subject}`;
}
