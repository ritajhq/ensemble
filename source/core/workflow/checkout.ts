import { join } from "@std/path";
import { exists } from "@std/fs";
import type { RepositoryResource } from "./schema.ts";
import type { RepositoryContext } from "./context.ts";

export interface CheckoutOptions {
  /** --repository <name>=<path|url> CLI overrides, keyed by repository name — take precedence over a declared entry's own `url`, and over "self" resolution when keyed "self". A value that's an existing directory on disk is used as-is (no clone); otherwise it's treated as a URL and cloned. */
  overrides?: Record<string, string>;
}

export interface ResolveSelfOptions {
  /** Repo root to resolve "self" against. */
  repoRoot: string;
  /** --local flag: "self" uses repoRoot directly (no clone) instead of being locally cloned into the run's scratch dir. */
  local?: boolean;
  /** --repository self=<path|url> CLI override, if set — see CheckoutOptions.overrides. */
  overrides?: Record<string, string>;
}

/**
 * Clones every declared resources.repositories entry into runDir/repos/<name>,
 * at the given ref (or the remote's default branch). A full clone, not
 * shallow — steps commonly need tag history (e.g. `git describe --tags`).
 * Sequential, not concurrent — simplest correct default for the handful of
 * repos a workflow is expected to declare.
 *
 * `options.overrides` (from --repository, CLI-only) lets a run point a
 * declared name straight at an existing local checkout instead of cloning
 * — no clone, the entry's `path` is just that directory as-is, uncommitted
 * changes and all. Machine/run-specific, so it's never something a
 * workflow.yml itself declares.
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

    result[name] = { path: await cloneRepository(name, repo.url, repo.ref, runDir) };
  }
  return result;
}

/**
 * Resolves "self" — the repo the running workflow itself belongs to — so a
 * job/step's `in: { repository: "self" }` has somewhere to point without
 * needing a matching resources.repositories entry. Only called when some
 * job/step in the run actually references "self" (see referencesSelf in
 * run-workflow.ts); a workflow that never references it never pays for
 * this.
 *
 * `options.overrides.self` (--repository self=<path|url>), if set, wins
 * outright. Otherwise: `options.local` (--local) uses repoRoot directly, no
 * clone — the live working tree, uncommitted changes included. Without
 * --local, resolves a source URL and clones it like any other repository
 * entry, isolating the run from repoRoot's uncommitted state: the
 * ENSEMBLE_SELF_REPO_URL env var, if set (how a containerized/server-
 * triggered run receives it — the platform server resolves it via the
 * workflow's linked git repository and forwards it in, since the
 * container's repoRoot has no real `.git` to read a remote from — see
 * run-workflow-in-container.ts), otherwise repoRoot's own `origin` remote
 * URL (a genuine local CLI run).
 */
export async function resolveSelfRepository(
  runDir: string,
  options: ResolveSelfOptions,
): Promise<RepositoryContext> {
  const override = options.overrides?.self;
  if (override !== undefined) {
    if (await exists(override, { isDirectory: true })) {
      return { path: override };
    }
    return { path: await cloneRepository("self", override, undefined, runDir) };
  }

  if (options.local) {
    return { path: options.repoRoot };
  }

  const originUrl = Deno.env.get("ENSEMBLE_SELF_REPO_URL") ?? await getOriginUrl(options.repoRoot);
  return { path: await cloneRepository("self", originUrl, undefined, runDir) };
}

async function getOriginUrl(repoRoot: string): Promise<string> {
  const { success, stdout } = await new Deno.Command("git", {
    args: ["-C", repoRoot, "remote", "get-url", "origin"],
    stdout: "piped",
    stderr: "inherit",
  }).output();
  if (!success) {
    throw new Error(`Failed to resolve "self" repository: no "origin" remote configured in ${repoRoot}.`);
  }
  return new TextDecoder().decode(stdout).trim();
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
