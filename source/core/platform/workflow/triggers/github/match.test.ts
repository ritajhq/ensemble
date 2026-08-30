import { assertEquals } from "@std/assert";
import type { Trigger } from "@ensemble/workflow";
import {
  extractBranchFromRef,
  extractTagFromRef,
  findMatchingGithubTrigger,
  matchesAnyPattern,
  type PushRef,
} from "./match.ts";

function tagRef(name: string): PushRef {
  return { kind: "tag", name };
}

function branchRef(name: string): PushRef {
  return { kind: "branch", name };
}

Deno.test("extractTagFromRef: extracts the tag name from a tag ref", () => {
  assertEquals(extractTagFromRef("refs/tags/1.2.3"), "1.2.3");
});

Deno.test("extractTagFromRef: undefined for a non-tag ref", () => {
  assertEquals(extractTagFromRef("refs/heads/main"), undefined);
});

Deno.test("extractBranchFromRef: extracts the branch name from a branch ref", () => {
  assertEquals(extractBranchFromRef("refs/heads/main"), "main");
});

Deno.test("extractBranchFromRef: undefined for a non-branch ref", () => {
  assertEquals(extractBranchFromRef("refs/tags/1.2.3"), undefined);
});

Deno.test("matchesAnyPattern: matches one of several glob patterns", () => {
  assertEquals(matchesAnyPattern("1.2.3", ["2.*", "1.*"]), true);
});

Deno.test("matchesAnyPattern: false when nothing matches", () => {
  assertEquals(matchesAnyPattern("1.2.3", ["2.*"]), false);
});

Deno.test("findMatchingGithubTrigger: returns the single matching entry for a tag ref", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3")), {
    push: { tags: ["1.*"] },
    context: "production",
  });
});

Deno.test("findMatchingGithubTrigger: undefined when no entry matches", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["2.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3")), undefined);
});

Deno.test("findMatchingGithubTrigger: undefined for an undeclared on: list", () => {
  assertEquals(findMatchingGithubTrigger(undefined, tagRef("1.2.3")), undefined);
});

Deno.test("findMatchingGithubTrigger: ignores interleaved manual entries", () => {
  const triggers: Trigger[] = [
    { manual: {} },
    { github: { push: { tags: ["1.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3"))?.context, "production");
});

Deno.test("findMatchingGithubTrigger: first-match-wins across multiple github entries", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["*.*.*-test"] }, context: "test" } },
    { github: { push: { tags: ["*.*.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3-test"))?.context, "test");
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3"))?.context, "production");
});

Deno.test("findMatchingGithubTrigger: checks every entry, not just the first (regression)", () => {
  // Previously, both handlers only ever looked at the FIRST github: entry
  // in a workflow's on: list — a tag that only matched the second entry
  // was silently missed. This must now resolve to the second entry.
  const triggers: Trigger[] = [
    { github: { push: { tags: ["*.*.*-test"] }, context: "test" } },
    { github: { push: { tags: ["*.*.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("2.0.0"))?.context, "production");
});

Deno.test("findMatchingGithubTrigger: an entry with no declared context resolves to undefined context", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"] } } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3"))?.context, undefined);
});

Deno.test("findMatchingGithubTrigger: matches a branch ref against push.branches", () => {
  const triggers: Trigger[] = [
    { github: { push: { branches: ["main"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, branchRef("main"))?.context, "production");
});

Deno.test("findMatchingGithubTrigger: a branch ref never matches an entry that only declares push.tags", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, branchRef("main")), undefined);
});

Deno.test("findMatchingGithubTrigger: a tag ref never matches an entry that only declares push.branches", () => {
  const triggers: Trigger[] = [
    { github: { push: { branches: ["main"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3")), undefined);
});

Deno.test("findMatchingGithubTrigger: an entry declaring both tags and branches matches either kind of ref", () => {
  const triggers: Trigger[] = [
    { github: { push: { tags: ["1.*"], branches: ["main"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, tagRef("1.2.3"))?.context, "production");
  assertEquals(findMatchingGithubTrigger(triggers, branchRef("main"))?.context, "production");
});

Deno.test("findMatchingGithubTrigger: glob patterns work for branch names too, e.g. release/*", () => {
  const triggers: Trigger[] = [
    { github: { push: { branches: ["release/*"] }, context: "production" } },
  ];
  assertEquals(findMatchingGithubTrigger(triggers, branchRef("release/1.2"))?.context, "production");
  assertEquals(findMatchingGithubTrigger(triggers, branchRef("main")), undefined);
});
