import { assertEquals, assertThrows } from "@std/assert";
import { StubReleaseLocator, UnknownReleaseError } from "./release-locator.ts";

const locator = new StubReleaseLocator({
  development: { web: { ref: "ens-local/web:dev" } },
  production: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
});

Deno.test("StubReleaseLocator.locate: resolves to the local locator in development mode", () => {
  assertEquals(locator.locate("web", "development"), {
    ref: "ens-local/web:dev",
  });
});

Deno.test("StubReleaseLocator.locate: resolves to the published locator in production mode", () => {
  assertEquals(locator.locate("web", "production"), {
    ref: "registry.ritaj.app/web:1.4.2",
  });
});

Deno.test("StubReleaseLocator.locate: throws for a release with no configured locator in that mode", () => {
  assertThrows(
    () => locator.locate("worker", "production"),
    UnknownReleaseError,
  );
});
