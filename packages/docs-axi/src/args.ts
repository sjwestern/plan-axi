import { AxiError } from "axi-sdk-js";

export type FlagKind = "string" | "boolean";

export interface CmdSpec {
  name: string;
  /** Flag name (with --) -> kind. `--docs` is always accepted. */
  flags: Record<string, FlagKind>;
  min: number;
  max: number;
  usage: string;
  /** Full `--help` text. */
  help: string;
}

export interface Parsed {
  pos: string[];
  flags: Record<string, string | boolean>;
}

const GLOBAL_FLAGS: Record<string, FlagKind> = { "--docs": "string" };

export function parseArgs(spec: CmdSpec, args: string[]): Parsed {
  const known = { ...spec.flags, ...GLOBAL_FLAGS };
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let rest = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (rest || !arg.startsWith("--")) {
      pos.push(arg);
      continue;
    }
    if (arg === "--") {
      rest = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq >= 0 ? arg.slice(0, eq) : arg;
    const kind = known[name];
    if (kind === undefined) {
      throw new AxiError(`unknown flag ${name} for \`${spec.name}\``, "VALIDATION_ERROR", [
        `valid flags for \`${spec.name}\`: ${Object.keys(known).join(", ")} (--help always allowed)`,
        `usage: ${spec.usage}`,
      ]);
    }
    if (kind === "boolean") {
      if (eq >= 0) {
        throw new AxiError(`${name} does not take a value`, "VALIDATION_ERROR", [`usage: ${spec.usage}`]);
      }
      flags[name] = true;
      continue;
    }
    let value: string | undefined;
    if (eq >= 0) value = arg.slice(eq + 1);
    else {
      value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new AxiError(`${name} requires a value`, "VALIDATION_ERROR", [
          `Pass ${name}=... if the value begins with --`,
        ]);
      }
      i++;
    }
    flags[name] = value;
  }
  if (pos.length < spec.min || pos.length > spec.max) {
    throw new AxiError(
      pos.length < spec.min
        ? `missing argument for \`${spec.name}\``
        : `too many arguments for \`${spec.name}\``,
      "VALIDATION_ERROR",
      [`usage: ${spec.usage}`],
    );
  }
  return { pos, flags };
}

export function flagStr(p: Parsed, name: string): string | undefined {
  const v = p.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function flagBool(p: Parsed, name: string): boolean {
  return p.flags[name] === true;
}

export function parseLimit(p: Parsed, fallback: number): number {
  const raw = flagStr(p, "--limit");
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new AxiError("--limit must be a positive integer", "VALIDATION_ERROR");
  }
  return Number(raw);
}

export function requireSingleLine(flag: string, value: string): string {
  const v = value.trim();
  if (v === "") throw new AxiError(`${flag} requires a non-empty value`, "VALIDATION_ERROR");
  if (/[\r\n]/.test(v)) throw new AxiError(`${flag} must be a single line`, "VALIDATION_ERROR");
  return v;
}
