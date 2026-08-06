import { join } from "@std/path";
import type { RepositoryResource } from "./schema.ts";
import type { RepositoryContext } from "./context.ts";

/**
 * Clones every declared resources.repositories entry into runDir/repos/<name>,
 * at the given ref (or the remote's default branch). A full clone, not
 * shallow — steps commonly need tag history (e.g. `git describe --tags`).
 * Sequential, not concurrent — simplest correct default for the handful of
 * repos a workflow is expected to declare.
 *
 * `localOverrides` (from .ensemble/config.local.yaml, resolved by the
 * caller) lets a developer point a name straight at an existing local
 * checkout instead of cloning — no clone, no symlink, the entry's `path` is
 * just that directory as-is, uncommitted changes and all. Machine-specific,
 * so it's never something a workflow.yml itself declares.
 */
export async function checkoutRepositories(
  repositories: Record<string, RepositoryResource> | undefined,
  runDir: string,
  localOverrides?: Record<string, string>,
): Promise<Record<string, RepositoryContext> | undefined> {
  if (repositories === undefined) return undefined;

  const result: Record<string, RepositoryContext> = {};
  for (const [name, repo] of Object.entries(repositories)) {
    const override = localOverrides?.[name];
    if (override !== undefined) {
      result[name] = { path: override };
      continue;
    }

    const dest = join(runDir, "repos", name);
    const args = ["clone"];
    if (repo.ref !== undefined) args.push("--branch", repo.ref);
    args.push(repo.url, dest);

    const { success } = await new Deno.Command("git", { args, stdout: "inherit", stderr: "inherit" }).output();
    if (!success) {
      throw new Error(`Failed to check out repository "${name}" (${repo.url}).`);
    }
    result[name] = { path: dest };
  }
  return result;
}
