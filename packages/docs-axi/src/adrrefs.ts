/** ADR references: full form is ADR-NNNN-slug. Parsing, resolving and bare-ref detection. */
import type { Doc } from "./model.js";

export interface AdrRef {
  /** Full matched token, e.g. `ADR-0012-some-slug`. */
  token: string;
  number: number;
  slug: string;
}

export interface AdrInfo {
  number: number;
  slug: string;
  path: string;
}

export type RefResolution =
  | { ok: true; adr: AdrInfo }
  | { ok: false; reason: "unknown-number" | "slug-mismatch"; expected?: string };

const FULL_RE = /(?<![\w-])ADR-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)/g;
const BARE_RE = /(?<![\w-])ADR[ -](\d+)(?![\w])/g;

/** Drop fenced blocks and inline code, keeping line count. */
export function stripCode(body: string): string {
  const out: string[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence;
      out.push("");
      continue;
    }
    out.push(fence ? "" : line.replace(/`[^`]*`/g, ""));
  }
  return out.join("\n");
}

/** Full-form refs outside code. */
export function findRefs(text: string): AdrRef[] {
  const refs: AdrRef[] = [];
  for (const m of stripCode(text).matchAll(FULL_RE)) {
    refs.push({ token: m[0], number: Number(m[1]), slug: m[2] as string });
  }
  return refs;
}

/** Number and slug must both match. */
export function resolveRef(ref: AdrRef, adrs: AdrInfo[]): RefResolution {
  const hit = adrs.find((a) => a.number === ref.number);
  if (!hit) return { ok: false, reason: "unknown-number" };
  if (hit.slug !== ref.slug) {
    return { ok: false, reason: "slug-mismatch", expected: adrToken(hit) };
  }
  return { ok: true, adr: hit };
}

export const adrToken = (a: { number: number; slug: string }): string =>
  `ADR-${String(a.number).padStart(4, "0")}-${a.slug}`;

/** Bare forms: `ADR 7`, `ADR 0007`, `ADR-7`, `ADR-0007` (no slug). */
export function findBareRefs(text: string): string[] {
  const out: string[] = [];
  const stripped = stripCode(text);
  for (const m of stripped.matchAll(BARE_RE)) {
    const after = stripped.slice((m.index as number) + m[0].length);
    // ADR-0012-slug is a full ref (a bad slug is reported by findRefs/resolveRef, not here)
    if (m[1]!.length === 4 && m[0][3] === "-" && /^-[a-z0-9]/.test(after)) continue;
    out.push(m[0]);
  }
  return [...new Set(out)];
}

/** ADR list from loaded docs (slug = file name without the number prefix). */
export function adrInfos(docs: Doc[]): AdrInfo[] {
  const out: AdrInfo[] = [];
  for (const d of docs) {
    if (d.adrNumber === undefined) continue;
    out.push({ number: d.adrNumber, slug: d.slug.replace(/^\d{4}-/, ""), path: d.path });
  }
  return out;
}

export interface RefProblem {
  code: "ADR_REF_UNKNOWN" | "ADR_REF_BARE";
  detail: string;
}

/** Check all ADR refs in one text. Messages name the expected form and the fix. */
export function checkRefs(text: string, adrs: AdrInfo[]): RefProblem[] {
  const problems: RefProblem[] = [];
  const seen = new Set<string>();
  for (const r of findRefs(text)) {
    if (seen.has(r.token)) continue;
    seen.add(r.token);
    const res = resolveRef(r, adrs);
    if (res.ok) continue;
    if (res.reason === "slug-mismatch") {
      problems.push({
        code: "ADR_REF_UNKNOWN",
        detail: `${r.token}: slug does not match ADR ${String(r.number).padStart(4, "0")}; use ${res.expected} (or run \`docs-axi adr fix-refs\`)`,
      });
    } else {
      problems.push({
        code: "ADR_REF_UNKNOWN",
        detail: `${r.token}: no ADR numbered ${String(r.number).padStart(4, "0")}; refs are ADR-NNNN-slug of an existing ADR`,
      });
    }
  }
  for (const b of findBareRefs(text)) {
    problems.push({
      code: "ADR_REF_BARE",
      detail: `"${b}": write the full ref ADR-NNNN-slug (e.g. ADR-0007-some-slug); \`docs-axi adr fix-refs\` rewrites existing ones`,
    });
  }
  return problems;
}
