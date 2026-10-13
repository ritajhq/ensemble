import { assertEquals, assertNotEquals } from "@std/assert";
import { BranchSlug } from "./branch-slug.ts";

Deno.test("BranchSlug keeps a name that is already a label", () => {
  assertEquals(BranchSlug.of("main").value, "main");
  assertEquals(BranchSlug.of("feat-login-2").value, "feat-login-2");
});

Deno.test("BranchSlug cleans other names and tells them apart from lookalikes", () => {
  const slashed = BranchSlug.of("feat/login").value;
  assertEquals(slashed.startsWith("feat-login-"), true);
  assertNotEquals(slashed, BranchSlug.of("feat-login").value);
  assertNotEquals(slashed, BranchSlug.of("feat/Login").value);
});

Deno.test("BranchSlug always yields a label an instance accepts", () => {
  for (
    const branch of ["a".repeat(120), "///", "Feat/ÅÄÖ", "-x-", "release/1.2.3"]
  ) {
    const { value } = BranchSlug.of(branch);
    assertEquals(
      /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(value),
      true,
      value,
    );
  }
});
