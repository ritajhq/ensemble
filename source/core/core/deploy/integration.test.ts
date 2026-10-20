import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import {
  buildUnitFor,
  integrationOf,
  isIntegration,
  sourceDirOf,
} from "./integration.ts";

Deno.test("integration: an app's wiring for a kit is a build unit of its own, under source/integrations", () => {
  assertEquals(integrationOf("server", "aws"), "integrations/aws/server");
  assertEquals([
    isIntegration("integrations/aws/server"),
    isIntegration("server"),
    isIntegration("my_app/server"),
  ], [true, false, false]);
  assertEquals(
    sourceDirOf("/repo/source", "integrations/aws/server"),
    "/repo/source/integrations/aws/server",
  );
  assertEquals(
    sourceDirOf("/repo/source", "my_app/server"),
    "/repo/source/apps/my_app/server",
  );
});

Deno.test("integration: a kit runs an app's integration for it when the project has one, else the app", async () => {
  const repo = await Deno.makeTempDir({ prefix: "ens-integration-" });
  try {
    await Deno.mkdir(join(repo, "source", "integrations", "aws", "server"), {
      recursive: true,
    });
    assertEquals(
      await buildUnitFor(repo, "server", "aws"),
      "integrations/aws/server",
    );
    assertEquals(await buildUnitFor(repo, "server", "cloudflare"), "server");
    assertEquals(await buildUnitFor(repo, "editor", "aws"), "editor");
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
});
