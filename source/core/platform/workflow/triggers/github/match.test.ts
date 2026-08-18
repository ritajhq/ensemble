import { assertEquals } from "@std/assert";
import type { Trigger } from "@ensemble/workflow";
import { extractTagFromRef, findMatchingGithubTrigger, matchesAnyTagPattern } from "./match.ts";

Deno.test("extractTagFromRef: extracts the tag name from a tag ref", () => {
  assertEquals(extractTagFromRef("refs/tags/1.2.3"), "1.2.3");
});

Deno.test("extractTagFromRef: undefined for a non-tag ref", () => {
  assertEquals(extractTagFromRef("refs/heads/main"), undefined);
});

Deno.test("matchesAnyTagPattern: matches one of several glob patterns", () => {
  assertEquals(matchesAnyTagPattern("1.2.3", ["2.*", "1.*"]), true);
});

Deno.test("matchesAnyTagPattern: false when nothing matches", () => {
  assertEquals(matchesAnyTagPattern("1.2.3", ["2.*"]), false);
});

Deno.test("findMatchingGithubTrigger: returns the single matching entry", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3"), {
    push: { tags: ["1.*"] },
    context: "production",
  });
});

Deno.test("findMatchingGithubTrigger: undefined when no entry matches", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["2.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3"), undefined);
});

Deno.test("findMatchingGithubTrigger: undefined for an undeclared on: list", () => {
  assertEquals(findMatchingGithubTrigger(undefined, "1.2.3"), undefined);
});

Deno.test("findMatchingGithubTrigger: ignores interleaved manual entries", () => {
  const triggers: Trigger[] = [
    { manual: {} },
    { github: { push: { tags: ["1.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3")?.context, "production");
});

Deno.test("findMatchingGithubTrigger: first-match-wins across multiple github entries", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["*.*.*-test"] }, context: "test" } },
    { github: { push: { tags: ["*.*.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3-test")?.context, "test");
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3")?.context, "production");
});

Deno.test("findMatchingGithubTrigger: checks every entry, not just the first (regression)", () => {
  // Previously, both handlers only ever looked at the FIRST github: entry
  // in a workflow's on: list — a tag that only matched the second entry
  // was silently missed. This must now resolve to the second entry.
  const triggers: Trigger[] = [
    { github: { push: { tags: ["*.*.*-test"] }, context: "test" } },
    { github: { push: { tags: ["*.*.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "2.0.0")?.context, "production");
});

Deno.test("findMatchingGithubTrigger: an entry with no declared context resolves to undefined context", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"] } } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, "1.2.3")?.context, undefined);
});
