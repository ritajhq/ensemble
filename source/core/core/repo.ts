import { dirname, join, resolve } from "@std/path";
import { exists } from "@std/fs";

/**
 * Walks up from `startDir` looking for the `.ensemble` marker directory.
 * If `ENSEMBLE_WORKSPACE` is set, it's trusted as-is instead — this is how
 * `ens` subcommands invoked from a workflow's `run:` steps (whose `cwd` is a
 * scratch temp dir unrelated to the repo, see run-workflow.ts) still find
 * the repo root.
 */
export async function findRepoRoot(startDir: string = Deno.cwd()): Promise<string> {
  const override = Deno.env.get("ENSEMBLE_WORKSPACE");
  if (override) return resolve(override);

  let dir = resolve(startDir);
  while (true) {
    if (await exists(join(dir, ".ensemble"), { isDirectory: true })) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        "Could not find repository root (no .ensemble directory found in any parent of " +
          `${startDir}).`,
      );
    }
    dir = parent;
  }
}
