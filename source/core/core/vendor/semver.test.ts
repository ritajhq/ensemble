import { assertEquals } from "@std/assert";
import * as SemVer from "./semver.ts";

Deno.test("SemVer.parseTag: parses plain and 'v'-prefixed tags", () => {
  assertEquals(SemVer.parseTag("1.2.3"), { major: 1, minor: 2, patch: 3 });
  assertEquals(SemVer.parseTag("v1.2.3"), { major: 1, minor: 2, patch: 3 });
});

Deno.test("SemVer.parseTag: returns undefined for a non-semver tag, without throwing", () => {
  assertEquals(SemVer.parseTag("main"), undefined);
  assertEquals(SemVer.parseTag("1.2.3-alpha"), undefined);
});

Deno.test("SemVer.formatTag: preserves the 'v' prefix style of the reference tag", () => {
  assertEquals(
    SemVer.formatTag({ major: 1, minor: 2, patch: 4 }, "v1.2.3"),
    "v1.2.4",
  );
  assertEquals(
    SemVer.formatTag({ major: 1, minor: 2, patch: 4 }, "1.2.3"),
    "1.2.4",
  );
});

Deno.test("SemVer.bump: patch/minor/major arithmetic", () => {
  const base = { major: 1, minor: 2, patch: 3 };
  assertEquals(SemVer.bump(base, "patch"), { major: 1, minor: 2, patch: 4 });
  assertEquals(SemVer.bump(base, "minor"), { major: 1, minor: 3, patch: 0 });
  assertEquals(SemVer.bump(base, "major"), { major: 2, minor: 0, patch: 0 });
});
