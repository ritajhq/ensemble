import { globToRegExp } from "@std/path";
import type { GithubTrigger, Trigger } from "@ensemble/workflow";

const TAG_REF_PREFIX = "refs/tags/";

/** Extracts the tag name from a push event's `ref` (e.g. "refs/tags/1.2.3" -> "1.2.3"), or undefined if it's not a tag push. */
export function extractTagFromRef(ref: string): string | undefined {
  return ref.startsWith(TAG_REF_PREFIX) ? ref.slice(TAG_REF_PREFIX.length) : undefined;
}

/** Matches a tag name against a list of glob patterns (e.g. "1.*"), the same semantics as GitHub Actions' on.push.tags. */
export function matchesAnyTagPattern(tag: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(tag));
}

/**
 * The first `on: - github:` entry (in declaration order) whose push.tags
 * matches the given tag, or undefined if none do. Checks every `github:`
 * entry, not just the first, so a workflow can declare several — e.g. a
 * more specific tag pattern (`*.*.*-test`) paired with its own `context`,
 * followed by a catch-all (`*.*.*`) — and have whichever one actually
 * matches determine the run's context. First-match-wins on declaration
 * order: put more specific patterns first.
 */
export function findMatchingGithubTrigger(
  triggers: Trigger[] | undefined,
  tag: string,
): GithubTrigger | undefined {
  return triggers
    ?.map((t) => t.github)
    .filter((g): g is GithubTrigger => g !== undefined)
    .find((g) => matchesAnyTagPattern(tag, g.push.tags));
}
