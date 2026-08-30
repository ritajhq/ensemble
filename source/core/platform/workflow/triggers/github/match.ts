import { globToRegExp } from "@std/path";
import type { GithubTrigger, Trigger } from "@ensemble/workflow";

const TAG_REF_PREFIX = "refs/tags/";
const BRANCH_REF_PREFIX = "refs/heads/";

/** Extracts the tag name from a push event's `ref` (e.g. "refs/tags/1.2.3" -> "1.2.3"), or undefined if it's not a tag push. */
export function extractTagFromRef(ref: string): string | undefined {
  return ref.startsWith(TAG_REF_PREFIX) ? ref.slice(TAG_REF_PREFIX.length) : undefined;
}

/** Extracts the branch name from a push event's `ref` (e.g. "refs/heads/main" -> "main"), or undefined if it's not a branch push. */
export function extractBranchFromRef(ref: string): string | undefined {
  return ref.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : undefined;
}

/** Matches a name (tag or branch) against a list of glob patterns (e.g. "1.*", "release/*"), the same semantics as GitHub Actions' on.push.tags/branches. */
export function matchesAnyPattern(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(name));
}

/** A push event's ref, discriminated by whether it's a tag or branch ref — see extractTagFromRef/extractBranchFromRef. */
export type PushRef = { kind: "tag"; name: string } | { kind: "branch"; name: string };

/**
 * The first `on: - github:` entry (in declaration order) whose push.tags (for
 * a tag ref) or push.branches (for a branch ref) matches the given ref, or
 * undefined if none do. Checks every `github:` entry, not just the first, so
 * a workflow can declare several — e.g. a more specific tag pattern
 * (`*.*.*-test`) paired with its own `context`, followed by a catch-all
 * (`*.*.*`), or a tag-push entry alongside a separate branch-push entry — and
 * have whichever one actually matches determine the run's context.
 * First-match-wins on declaration order: put more specific patterns first.
 */
export function findMatchingGithubTrigger(
  triggers: Trigger[] | undefined,
  ref: PushRef,
): GithubTrigger | undefined {
  const patternsFor = (g: GithubTrigger): string[] | undefined =>
    ref.kind === "tag" ? g.push.tags : g.push.branches;

  return triggers
    ?.map((t) => t.github)
    .filter((g): g is GithubTrigger => g !== undefined)
    .find((g) => {
      const patterns = patternsFor(g);
      return patterns !== undefined && matchesAnyPattern(ref.name, patterns);
    });
}
