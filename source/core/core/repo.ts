import { dirname, join, resolve } from "@std/path";
import { exists } from "@std/fs";

/** Walks up from `startDir` looking for the `.ensemble` marker directory. */
export async function findRepoRoot(startDir: string = Deno.cwd()): Promise<string> {
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
