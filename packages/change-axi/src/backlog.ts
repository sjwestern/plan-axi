import { AxiError } from "axi-sdk-js";
import { resolveChange, type Ctx } from "./change.js";
import { runTasks } from "./tasks.js";

/** Kinds for unplanned backlog items. `change` is reserved for items with a plan folder. */
export const UNPLANNED_KINDS = ["idea", "bug", "chore"] as const;
export type UnplannedKind = (typeof UNPLANNED_KINDS)[number];

export const isUnplannedKind = (k: string): k is UnplannedKind => (UNPLANNED_KINDS as readonly string[]).includes(k);

export function checkKind(kind: string): UnplannedKind {
  if (!isUnplannedKind(kind)) {
    throw new AxiError(`bad kind "${kind}"`, "VALIDATION_ERROR", [`Kinds: ${UNPLANNED_KINDS.join(", ")} (\`change\` is created by \`change-axi new\`)`]);
  }
  return kind;
}

const MAX_DERIVED = 50;

/** Kebab-case slug from a title: lowercase, stop punctuation dropped, first word kept, max 50 chars, no suffix. */
export function deriveSlug(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w !== "");
  let slug = "";
  for (const w of words) {
    const next = slug === "" ? w : `${slug}-${w}`;
    if (next.length > MAX_DERIVED) break;
    slug = next;
  }
  return slug === "" ? (words[0] ?? "").slice(0, MAX_DERIVED) : slug;
}

const WHERE = { active: "an active change", archived: "an archived change", backlog: "already in backlog.md" } as const;

/** Where a slug is taken (active plan, archived plan, backlog item in any state), or undefined. */
export function slugTaken(ctx: Ctx, slug: string): string | undefined {
  const r = resolveChange(ctx, slug);
  return r ? WHERE[r.state] : undefined;
}

export interface BacklogItem {
  slug: string;
  kind: string;
  priority: number | undefined;
  repo: string;
  title: string;
  created: string;
  state: string;
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (q) {
      if (c === "\\") cur += line[++i] ?? "";
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      cells.push(cur);
      cur = "";
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** Unplanned (kind != change) open backlog items, sorted by priority (unset last) then age. */
export function listUnplanned(ctx: Ctx): BacklogItem[] {
  const items: BacklogItem[] = [];
  for (const state of ["queued", "in_flight"]) {
    const out = runTasks(ctx.root, ["list", "--file", "backlog.md", "--state", state, "--fields", "priority,created", "--limit", "1000"]);
    const lines = out.split("\n");
    const head = lines.findIndex((l) => /^tasks\[\d+\]\{/.test(l));
    if (head < 0) continue;
    const cols = ((/\{(.*)\}/.exec(lines[head] as string) as RegExpExecArray)[1] as string).split(",");
    for (let i = head + 1; i < lines.length && (lines[i] as string).startsWith("  "); i++) {
      const cells = splitRow((lines[i] as string).trim());
      if (cells.length !== cols.length) break;
      const t = Object.fromEntries(cols.map((c, j) => [c, cells[j] as string])) as Record<string, string>;
      const kind = t["kind"] ?? "";
      if (!isUnplannedKind(kind)) continue;
      const pr = Number(t["priority"]);
      items.push({
        slug: t["id"] as string,
        kind,
        priority: t["priority"] === undefined || t["priority"] === "-" || Number.isNaN(pr) ? undefined : pr,
        repo: t["repo"] && t["repo"] !== "-" ? t["repo"] : "",
        title: t["title"] ?? "",
        created: t["created"] ?? "",
        state,
      });
    }
  }
  return items.sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || a.created.localeCompare(b.created) || a.slug.localeCompare(b.slug),
  );
}
