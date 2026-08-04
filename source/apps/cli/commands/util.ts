import { ValidationError } from "@cliffy/command";

/** Parses repeatable `KEY=VALUE` flag values (e.g. `-e`/`--var`) into a mapping. */
export function parseVarOverrides(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      throw new ValidationError(`Invalid "${pair}", expected KEY=VALUE.`);
    }
    result[pair.slice(0, separatorIndex)] = pair.slice(separatorIndex + 1);
  }
  return result;
}
