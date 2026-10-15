import { normalizeEol } from "./fsutil.js";
import { MAX_SUMMARY } from "./model.js";

export function stripMd(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function humanize(stem: string): string {
  const w = stem.replace(/[-_]+/g, " ").trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function deriveTitleSummary(
  body: string,
  stem: string,
): { title: string; summary: string; needsSummary: boolean } {
  const lines = normalizeEol(body).split("\n");
  let title: string | undefined;
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(lines[i] as string);
    if (m) {
      title = stripMd(m[1] as string);
      i++;
      break;
    }
    if ((lines[i] as string).trim() !== "") break;
  }
  if (title === undefined) i = 0;
  let para: string[] = [];
  let fence = false;
  for (; i < lines.length; i++) {
    const l = (lines[i] as string).trim();
    if (/^(```|~~~)/.test(l)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (l === "") {
      if (para.length > 0) break;
      continue;
    }
    if (/^(#|>|\||-{3,}|[-*+]\s|\d+\.\s|<|!\[|\[!)/.test(l)) {
      if (para.length > 0) break;
      continue;
    }
    para.push(l);
  }
  let summary = stripMd(para.join(" "));
  const first = /^(.{20,}?[.!?])(\s|$)/.exec(summary);
  if (first) summary = first[1] as string;
  const t = title && title !== "" ? title : humanize(stem);
  const needsSummary = summary === "";
  if (needsSummary) summary = t;
  if (summary.length > MAX_SUMMARY) {
    const cut = summary.slice(0, MAX_SUMMARY - 3);
    summary = `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40))}...`;
  }
  return { title: t, summary, needsSummary };
}


const LEADIN_RE = /^(status|note|notes|authority|purpose|scope|source|reference only)\s*[:(-]/i;

function prefixKey(summary: string): string | undefined {
  const i = summary.indexOf(":");
  return i >= 12 ? summary.slice(0, i).toLowerCase() : undefined;
}

/**
 * Summaries that tell a reader nothing the title does not: equal to the title,
 * a status/note lead-in, or the same prefix shared by 3+ docs ("Specification for X: <title>").
 * Returns reason per index of `items`.
 */
export function weakSummaries(items: { title: string; summary: string; placeholder?: boolean }[]): Map<number, string> {
  const out = new Map<number, string>();
  const prefixCount = new Map<string, number>();
  const exactCount = new Map<string, number>();
  const norm = (x: string): string => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const it of items) {
    exactCount.set(norm(it.summary), (exactCount.get(norm(it.summary)) ?? 0) + 1);
    const k = prefixKey(it.summary);
    if (k) prefixCount.set(k, (prefixCount.get(k) ?? 0) + 1);
  }
  items.forEach((it, i) => {
    if (it.placeholder || norm(it.summary) === norm(it.title)) out.set(i, "same as title");
    else if (LEADIN_RE.test(it.summary)) out.set(i, "status/note lead-in, not a description");
    else {
      const k = prefixKey(it.summary);
      if (k && (prefixCount.get(k) ?? 0) >= 3) out.set(i, `prefix "${it.summary.slice(0, (k as string).length)}" repeated across docs`);
      else if ((exactCount.get(norm(it.summary)) ?? 0) >= 2) out.set(i, "identical summary on several docs");
    }
  });
  return out;
}
