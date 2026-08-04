import { ValidationError } from "@cliffy/command";

export function splitPair(pair: string): [string, string] {
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex === -1) {
    throw new ValidationError(`Invalid "${pair}", expected KEY=VALUE.`);
  }
  return [pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1)];
}

/** Parses repeatable `KEY=VALUE` flag values (e.g. `-v`/`--var`) into a mapping. */
export function parseVarOverrides(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const [key, value] = splitPair(pair);
    result[key] = value;
  }
  return result;
}

/**
 * Parses repeatable `KEY=VALUE` flag values (e.g. `-i`/`--input`) into a
 * mapping of typed values: each VALUE is JSON-parsed when possible (so
 * `-i replicas=3` yields the number 3, `-i enabled=true` the boolean true,
 * `-i config='{"a":1}'` a real object), falling back to the raw string when
 * it isn't valid JSON (so `-i sha=abc123` still works unquoted).
 */
export function parseInputOverrides(pairs: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of pairs) {
    const [key, value] = splitPair(pair);
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}
