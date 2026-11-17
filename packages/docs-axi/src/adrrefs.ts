/** ADR references: full form is ADR-NNNN-slug. Parsing, resolving and bare-ref detection. */
import type { Doc } from "./model.js";

export interface AdrRef {
  /** Full matched token, e.g. `ADR-0012-some-slug` or `repo:ADR-0012-some-slug`. */
  token: string;
  number: number;
  slug: string;
  /** Source repo from a qualified ref (`repo:ADR-NNNN-slug`). */
  repo?: string;
}

export interface AdrInfo {
  number: number;
  slug: string;
  path: string;
  /** Name of the source repo when the ADR lives outside the plan repo. */
  repo?: string;
}

export type RefResolution =
  | { ok: true; adr: AdrInfo }
  | { ok: false; reason: "unknown-number" | "slug-mismatch"; expected?: string }
  | { ok: false; reason: "ambiguous"; expected: string };

const FULL_RE = /(?<![\w-])(?:([a-z0-9][a-z0-9-]*):)?ADR-(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)/g;
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

/**
 * Full-form refs outside code. Qualified refs (`repo:ADR-NNNN-slug`, an ADR in another repo) are skipped
 * unless `qualified` is set, so tools that rewrite refs in one repo never touch them.
 */
export function findRefs(text: string, opts: { qualified?: boolean } = {}): AdrRef[] {
  const refs: AdrRef[] = [];
  for (const m of stripCode(text).matchAll(FULL_RE)) {
    if (m[1] !== undefined && !opts.qualified) continue;
    refs.push({ token: m[0], number: Number(m[2]), slug: m[3] as string, ...(m[1] !== undefined ? { repo: m[1] } : {}) });
  }
  return refs;
}

/**
 * Number and slug must both match. A qualified ref only looks at ADRs of that repo. An unqualified ref looks at all of
 * `adrs`; when the same number and slug exist in more than one repo it is ambiguous and must be qualified.
 */
export function resolveRef(ref: AdrRef, adrs: AdrInfo[]): RefResolution {
  const byNumber = adrs.filter((a) => a.number === ref.number && (ref.repo === undefined || a.repo === ref.repo));
  if (byNumber.length === 0) return { ok: false, reason: "unknown-number" };
  const hits = byNumber.filter((a) => a.slug === ref.slug);
  if (hits.length === 0) {
    return { ok: false, reason: "slug-mismatch", expected: `${ref.repo ? `${ref.repo}:` : ""}${adrToken(byNumber[0] as AdrInfo)}` };
  }
  if (hits.length > 1) {
    const forms = hits.map((a) => (a.repo ? `${a.repo}:${adrToken(a)}` : adrToken(a)));
    return { ok: false, reason: "ambiguous", expected: forms.join(" or ") };
  }
  return { ok: true, adr: hits[0] as AdrInfo };
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
  code: "ADR_REF_UNKNOWN" | "ADR_REF_BARE" | "ADR_REF_AMBIGUOUS";
  detail: string;
}

/**
 * Check all ADR refs in one text. Messages name the expected form and the fix. Qualified refs are checked only
 * with `qualified` set (plan checks); docs checks leave them alone.
 */
export function checkRefs(text: string, adrs: AdrInfo[], opts: { qualified?: boolean } = {}): RefProblem[] {
  const problems: RefProblem[] = [];
  const seen = new Set<string>();
  for (const r of findRefs(text, opts)) {
    if (seen.has(r.token)) continue;
    seen.add(r.token);
    const res = resolveRef(r, adrs);
    if (res.ok) continue;
    if (res.reason === "ambiguous") {
      problems.push({ code: "ADR_REF_AMBIGUOUS", detail: `${r.token}: exists in more than one repo; qualify it as ${res.expected}` });
    } else if (res.reason === "slug-mismatch") {
      problems.push({
        code: "ADR_REF_UNKNOWN",
        detail: `${r.token}: slug does not match ADR ${String(r.number).padStart(4, "0")}; use ${res.expected} (or run \`docs-axi adr fix-refs\`)`,
      });
    } else {
      problems.push({
        code: "ADR_REF_UNKNOWN",
        detail: `${r.token}: no ADR numbered ${String(r.number).padStart(4, "0")}${r.repo ? ` in repo ${r.repo}` : ""}; refs are ADR-NNNN-slug of an existing ADR`,
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
