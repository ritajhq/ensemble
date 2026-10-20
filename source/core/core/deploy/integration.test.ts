import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import {
  buildUnitFor,
  integrationOf,
  isIntegration,
  isReserved,
  parseIntegration,
  sourceDirOf,
} from "./integration.ts";

Deno.test("integration: an app's wiring for a kit is a build unit of its own, under source/integrations", () => {
  assertEquals(integrationOf("server", "aws"), "integrations/aws/server");
  assertEquals(parseIntegration("integrations/aws/my_app/server"), {
    kit: "aws",
    app: "my_app/server",
  });
  assertEquals(
    sourceDirOf("/repo/source", "integrations/aws/server"),
    "/repo/source/integrations/aws/server",
  );
  assertEquals(
    sourceDirOf("/repo/source", "my_app/server"),
    "/repo/source/apps/my_app/server",
  );
});

Deno.test("integration: only integrations/<kit>/<app> names one, and the prefix is never an app's", () => {
  assertEquals(
    [
      "integrations/aws/server",
      "server",
      "integrations/x",
      "integrations",
      "integrations//server",
      "apps/integrations/x",
    ].map(isIntegration),
    [true, false, false, false, false, false],
  );
  assertEquals(
    [
      "integrations",
      "integrations/x",
      "integrations/aws/server",
      "integrationsx",
      "my/integrations",
    ].map(isReserved),
    [true, true, true, false, false],
  );
});

async function withRepo(body: (repo: string) => Promise<void>): Promise<void> {
  const repo = await Deno.makeTempDir({ prefix: "ens-integration-" });
  try {
    await Deno.mkdir(join(repo, "source", "integrations", "aws", "server"), {
      recursive: true,
    });
    await body(repo);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
}

Deno.test("integration: a kit runs an app's integration for it when the project builds one, else the app", async () => {
  await withRepo(async (repo) => {
    await Deno.mkdir(join(repo, ".ensemble"), { recursive: true });
    await Deno.writeTextFile(
      join(repo, ".ensemble", "config.yaml"),
      "build:\n  integrations/aws/server:\n    kit: deno.bundle\n",
    );
    assertEquals(
      await buildUnitFor(repo, "server", "aws"),
      "integrations/aws/server",
    );
    assertEquals(await buildUnitFor(repo, "server", "cloudflare"), "server");
    assertEquals(await buildUnitFor(repo, "editor", "aws"), "editor");
  });
});

Deno.test("integration: an integration's folder with nothing configured to build it is an error, not the app", async () => {
  await withRepo(async (repo) => {
    await assertRejects(
      () => buildUnitFor(repo, "server", "aws"),
      Error,
      `no "build.integrations/aws/server" entry`,
    );
  });
});
