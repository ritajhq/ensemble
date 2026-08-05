import { dirname, join, resolve } from "@std/path";
import { exists } from "@std/fs";

/**
 * Walks up from `startDir` looking for the `.ensemble` marker directory.
 * Falls back to `ENSEMBLE_WORKSPACE` when no marker is found — this is how
 * `ens` subcommands invoked from a workflow's `run:` steps whose `cwd` isn't
 * rooted in a repo (e.g. a scratch temp dir, see run-workflow.ts) still find
 * a repo root. A step that `cd`s into its own checkout (e.g. a workflow that
 * `git clone`s a fresh copy) is still found by the cwd walk first, rather
 * than being shadowed by a stale `ENSEMBLE_WORKSPACE` inherited from the
 * process that dispatched the workflow.
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
