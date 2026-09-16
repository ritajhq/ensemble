import { dirname, join, resolve } from "@std/path";
import { exists } from "@std/fs";

/**
 * Walks up from `startDir` looking for the `.ensemble` marker directory.
 * Falls back to `ENSEMBLE_WORKSPACE` when no marker is found — this is how
 * `ens` invoked with a `cwd` that isn't rooted in a repo (e.g. a scratch
 * temp dir) still finds a repo root. The cwd walk is tried first, so a
 * process that `cd`s into its own checkout isn't shadowed by a stale
 * `ENSEMBLE_WORKSPACE` inherited from whoever dispatched it.
 */
export async function findRepoRoot(startDir: string = Deno.cwd()): Promise<string> {
  let dir = resolve(startDir);
  while (true) {
    if (await exists(join(dir, ".ensemble"), { isDirectory: true })) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const override = Deno.env.get("ENSEMBLE_WORKSPACE");
  if (override) return resolve(override);

  throw new Error(
    "Could not find repository root (no .ensemble directory found in any parent of " +
      `${startDir}, and ENSEMBLE_WORKSPACE is not set).`,
  );
}
