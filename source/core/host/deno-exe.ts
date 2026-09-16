import { RealEnvironment, which } from "@david/which";

let cached: string | undefined;

/**
 * Resolves the real `deno` executable on PATH.
 *
 * dax's `$` shell always resolves the literal "deno" command to
 * `Deno.execPath()`. That's correct when ens runs via `deno run`/`deno task`,
 * but wrong once ens itself is `deno compile`d: `Deno.execPath()` then
 * points at the `ens` binary, not the Deno CLI, so any `$`deno ...`` call
 * would silently re-invoke ens instead. Spawn this resolved path instead of
 * the literal "deno" word.
 */
export async function resolveDenoExecutable(): Promise<string> {
  if (!cached) {
    const found = await which("deno", new RealEnvironment());
    if (!found) {
      throw new Error("Could not locate the `deno` executable on PATH.");
    }
    cached = found;
  }
  return cached;
}
