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
 * it isn't valid JSON (so `-i sha=abc123` still works unquoted). Repeating
 * the same KEY collects its values into an array instead of the last one
 * winning (so `-i job=server -i job=web` yields `job: ["server", "web"]`
 * without needing JSON) — a key given once still yields a plain scalar.
 */
export function parseInputOverrides(pairs: string[]): Record<string, unknown> {
  const parsed = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const collected = new Map<string, unknown[]>();
  for (const pair of pairs) {
    const [key, value] = splitPair(pair);
    if (!collected.has(key)) collected.set(key, []);
    collected.get(key)!.push(parsed(value));
  }

  const result: Record<string, unknown> = {};
  for (const [key, values] of collected) {
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}
