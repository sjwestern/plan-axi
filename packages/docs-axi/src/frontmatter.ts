import { applyEol, detectEol, normalizeEol } from "./fsutil.js";

export type FmValue = string | string[];

export interface ParsedDoc {
  hasFrontmatter: boolean;
  /** Frontmatter lines (LF, without the --- fences). */
  lines: string[];
  data: Record<string, FmValue>;
  /** Everything after the closing fence (LF). */
  body: string;
  errors: string[];
}

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/;

function parseScalar(raw: string): FmValue {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(v);
      if (typeof parsed === "string") return parsed;
    } catch {
      /* fall through to plain */
    }
    return v;
  }
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((s) => {
      const item = s.trim();
      if (item.startsWith('"')) {
        try {
          const parsed: unknown = JSON.parse(item);
          if (typeof parsed === "string") return parsed;
        } catch {
          /* plain */
        }
      }
      return item;
    });
  }
  return v;
}

export function parseDoc(rawText: string): ParsedDoc {
  const text = normalizeEol(rawText);
  const result: ParsedDoc = {
    hasFrontmatter: false,
    lines: [],
    data: {},
    body: text,
    errors: [],
  };
  if (!text.startsWith("---\n")) return result;
  const rest = text.slice(4);
  let end = -1;
  let bodyStart = 0;
  if (rest.startsWith("---\n") || rest === "---") {
    end = 0;
    bodyStart = rest === "---" ? 3 : 4;
  } else {
    const idx = rest.indexOf("\n---\n");
    if (idx >= 0) {
      end = idx + 1;
      bodyStart = idx + 5;
    } else if (rest.endsWith("\n---")) {
      end = rest.length - 3;
      bodyStart = rest.length;
    }
  }
  if (end < 0) {
    result.errors.push("frontmatter is not closed with ---");
    return result;
  }
  result.hasFrontmatter = true;
  result.body = rest.slice(bodyStart);
  const block = rest.slice(0, end);
  result.lines = block === "" ? [] : block.replace(/\n$/, "").split("\n");
  result.lines.forEach((line, i) => {
    if (line.trim() === "" || line.trim().startsWith("#")) return;
    const m = KEY_LINE.exec(line);
    if (!m) {
      result.errors.push(`frontmatter line ${i + 1} is not "key: value"`);
      return;
    }
    result.data[m[1]!] = parseScalar(m[2]!);
  });
  return result;
}

const PLAIN_SAFE = /^[A-Za-z0-9][^:#"'[\]{}\n\\]*$/;
const YAML_SPECIAL = /^(true|false|null|yes|no|on|off|~|[-+]?\d[\d._]*)$/i;

export function formatScalar(value: string): string {
  if (
    PLAIN_SAFE.test(value) &&
    !YAML_SPECIAL.test(value) &&
    value === value.trim()
  ) {
    return value;
  }
  return JSON.stringify(value);
}

export function formatValue(value: FmValue): string {
  if (Array.isArray(value)) return `[${value.map(formatScalar).join(", ")}]`;
  return formatScalar(value);
}

/**
 * Set or remove keys in the frontmatter, leaving every other line byte-exact.
 * `undefined` removes the key. Returns the new full file text.
 */
export function setFrontmatter(
  rawText: string,
  changes: Record<string, FmValue | undefined>,
): string {
  const eol = detectEol(rawText);
  const parsed = parseDoc(rawText);
  const lines = [...parsed.lines];
  for (const [key, value] of Object.entries(changes)) {
    const idx = lines.findIndex((l) => KEY_LINE.exec(l)?.[1] === key);
    if (value === undefined) {
      if (idx >= 0) lines.splice(idx, 1);
      continue;
    }
    const line = `${key}: ${formatValue(value)}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  const body = parsed.hasFrontmatter ? parsed.body : normalizeEol(rawText);
  const block = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  const out = parsed.hasFrontmatter || lines.length > 0
    ? `---\n${block}---\n${body}`
    : body;
  return applyEol(out, eol);
}

export function renderNewDoc(
  fields: Record<string, FmValue | undefined>,
  body: string,
): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    lines.push(`${k}: ${formatValue(v)}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n${body.replace(/^\n+/, "")}`;
}
