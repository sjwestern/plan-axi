import { existsSync, readFileSync } from "node:fs";
import { AxiError } from "axi-sdk-js";
import { flagStr, type Parsed } from "./args.js";
import { normalizeEol, readText } from "./fsutil.js";

/** Body text from --body, --body-file (`-` = stdin) or piped stdin. */
export function readBodyInput(p: Parsed, required = true): string | undefined {
  const inline = flagStr(p, "--body");
  const file = flagStr(p, "--body-file");
  if (inline !== undefined && file !== undefined) {
    throw new AxiError("pass only one of --body and --body-file", "VALIDATION_ERROR");
  }
  if (inline !== undefined) return normalizeEol(inline);
  if (file !== undefined && file !== "-") {
    if (!existsSync(file)) throw new AxiError(`--body-file not found: ${file}`, "NOT_FOUND");
    return normalizeEol(readText(file));
  }
  if (file === "-" || (required && !process.stdin.isTTY)) return readStdin();
  if (required) {
    throw new AxiError("no body given", "VALIDATION_ERROR", [
      "Pipe the text on stdin, or pass --body <text> or --body-file <path>",
    ]);
  }
  return undefined;
}

function readStdin(): string {
  try {
    return normalizeEol(readFileSync(0, "utf8"));
  } catch {
    throw new AxiError("could not read stdin", "VALIDATION_ERROR", ["Pass --body <text> or --body-file <path>"]);
  }
}
