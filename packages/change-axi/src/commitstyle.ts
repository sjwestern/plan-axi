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

export const MAX_COMMIT_HEADER_LENGTH = 100;

function truncateSubject(subject: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (subject.length <= maxLength) return subject;
  return maxLength >= 3 ? `${subject.slice(0, maxLength - 3)}...` : subject.slice(0, maxLength);
}

export function commitHeader(type: string, scope: string, subject: string, slug?: string): string {
  const prefix = scope === "" ? `${type}: ` : `${type}(${scope}): `;
  const available = MAX_COMMIT_HEADER_LENGTH - prefix.length;
  if (available <= 0) throw new AxiError("commit type and scope leave no room for a subject within the 100-character header limit", "VALIDATION_ERROR");
  if (subject.length <= available) return `${prefix}${subject}`;

  if (slug) {
    const slugStart = subject.indexOf(slug);
    if (slugStart >= 0) {
      const before = subject.slice(0, slugStart);
      const after = subject.slice(slugStart + slug.length);
      const slugLength = available - before.length - after.length;
      if (slugLength >= 3) {
        return `${prefix}${before}${slug.slice(0, slugLength - 3)}...${after}`;
      }
    }
  }

  return `${prefix}${truncateSubject(subject, available)}`;
}
