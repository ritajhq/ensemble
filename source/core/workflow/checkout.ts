import { join } from "@std/path";
import { exists } from "@std/fs";
import type { RepositoryResource } from "./schema.ts";
import type { RepositoryContext } from "./context.ts";

export interface CheckoutOptions {
  /** Repo root to resolve `in: { repository: "self" }` entries against. */
  repoRoot: string;
  /** When true, an `in: self` entry uses repoRoot directly (no clone) instead of being locally cloned into the run's scratch dir. */
  local?: boolean;
  /** --repository <name>=<path|url> CLI overrides, keyed by repository name — take precedence over both `url` and `in: self` resolution for that name. A value that's an existing directory on disk is used as-is (no clone), same as an `in: self` entry under --local; otherwise it's treated as a URL and cloned. */
  overrides?: Record<string, string>;
}

/**
 * Checks out every declared resources.repositories entry into
 * runDir/repos/<name>, at the given ref (or the source's default branch). A
 * full clone, not shallow — steps commonly need tag history (e.g.
 * `git describe --tags`). Sequential, not concurrent — simplest correct
 * default for the handful of repos a workflow is expected to declare.
 *
 * Per entry, in priority order:
 * 1. `options.overrides[name]` (from --repository, CLI-only, machine/run
 *    specific) — an existing local directory is used as-is; otherwise
 *    cloned as a URL.
 * 2. `in: { repository: "self" }` — under `options.local` (--local), uses
 *    `options.repoRoot` directly, no clone. Otherwise locally clones
 *    `options.repoRoot`, still isolating the run from the working tree's
 *    uncommitted state like any other entry.
 * 3. `url` — cloned as today.
 */
export async function checkoutRepositories(
  repositories: Record<string, RepositoryResource> | undefined,
  runDir: string,
  options: CheckoutOptions,
): Promise<Record<string, RepositoryContext> | undefined> {
  if (repositories === undefined) return undefined;

  const result: Record<string, RepositoryContext> = {};
  for (const [name, repo] of Object.entries(repositories)) {
    const override = options.overrides?.[name];
    if (override !== undefined) {
      if (await exists(override, { isDirectory: true })) {
        result[name] = { path: override };
        continue;
      }
      result[name] = { path: await cloneRepository(name, override, repo.ref, runDir) };
      continue;
    }

    if (repo.in?.repository === "self") {
      if (options.local) {
        result[name] = { path: options.repoRoot };
        continue;
      }
      result[name] = { path: await cloneRepository(name, options.repoRoot, repo.ref, runDir) };
      continue;
    }

    result[name] = { path: await cloneRepository(name, repo.url!, repo.ref, runDir) };
  }
  return result;
}

async function cloneRepository(
  name: string,
  source: string,
  ref: string | undefined,
  runDir: string,
): Promise<string> {
  const dest = join(runDir, "repos", name);
  const args = ["clone"];
  if (ref !== undefined) args.push("--branch", ref);
  args.push(source, dest);

  const { success } = await new Deno.Command("git", { args, stdout: "inherit", stderr: "inherit" }).output();
  if (!success) {
    throw new Error(`Failed to check out repository "${name}" (${source}).`);
  }
  return dest;
}
