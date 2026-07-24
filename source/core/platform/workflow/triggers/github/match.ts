import { globToRegExp } from "@std/path";

const TAG_REF_PREFIX = "refs/tags/";

/** Extracts the tag name from a push event's `ref` (e.g. "refs/tags/1.2.3" -> "1.2.3"), or undefined if it's not a tag push. */
export function extractTagFromRef(ref: string): string | undefined {
  return ref.startsWith(TAG_REF_PREFIX) ? ref.slice(TAG_REF_PREFIX.length) : undefined;
}

/** Matches a tag name against a list of glob patterns (e.g. "1.*"), the same semantics as GitHub Actions' on.push.tags. */
export function matchesAnyTagPattern(tag: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(tag));
}
