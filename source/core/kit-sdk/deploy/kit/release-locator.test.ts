import { assertEquals, assertThrows } from "@std/assert";
import { StubReleaseLocator, UnknownReleaseError } from "./release-locator.ts";

const locator = new StubReleaseLocator({
  local: { web: { ref: "ens-local/web:dev" } },
  published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
});

Deno.test("StubReleaseLocator.locate: resolves to the local locator for local artifacts", () => {
  assertEquals(locator.locate("web", "local"), {
    ref: "ens-local/web:dev",
  });
});

Deno.test("StubReleaseLocator.locate: resolves to the published locator for published artifacts", () => {
  assertEquals(locator.locate("web", "published"), {
    ref: "registry.ritaj.app/web:1.4.2",
  });
});

Deno.test("StubReleaseLocator.locate: throws for a release with no configured locator for that artifacts source", () => {
  assertThrows(
    () => locator.locate("worker", "published"),
    UnknownReleaseError,
  );
});
