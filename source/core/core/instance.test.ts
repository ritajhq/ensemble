import { assertEquals, assertThrows } from "@std/assert";
import { Instance } from "./instance.ts";

Deno.test("Instance scopes a workload apart from its plain deployment and from other instances", () => {
  assertEquals(
    Instance.parse("feat-foo").scope("website"),
    "website--feat-foo",
  );
  assertEquals(
    Instance.parse("feat-foo").scope("website") ===
      Instance.parse("fix-bar").scope("website"),
    false,
  );
});

Deno.test("Instance accepts only what survives as a DNS label", () => {
  for (const bad of ["", "Feat", "-a", "a-", "a_b", "a/b", "a".repeat(51)]) {
    assertThrows(() => Instance.parse(bad), Error, "Invalid instance");
  }
  assertEquals(Instance.parse("a").slug, "a");
  assertEquals(Instance.parse("a".repeat(50)).slug, "a".repeat(50));
});
