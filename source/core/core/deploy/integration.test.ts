import { join } from "@std/path";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { EnsembleConfigStore } from "../config.ts";
import {
  buildUnitFor,
  integrationKitsOf,
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

const LIBRARY =
  "build:\n  server:\n    integrations:\n      aws:\n        kit: deno.bundle\n  editor:\n    kit: react\n";

async function inRepo(
  config: string,
  run: (repo: string) => Promise<void>,
): Promise<void> {
  const repo = await Deno.makeTempDir({ prefix: "ens-integration-" });
  try {
    await Deno.mkdir(join(repo, ".ensemble"), { recursive: true });
    await Deno.writeTextFile(join(repo, ".ensemble", "config.yaml"), config);
    await run(repo);
  } finally {
    await Deno.remove(repo, { recursive: true });
  }
}

Deno.test("integration: a kit runs a library's integration for it, and a program as it is", async () => {
  await inRepo(LIBRARY, async (repo) => {
    assertEquals(await integrationKitsOf(repo, "server"), ["aws"]);
    assertEquals(await integrationKitsOf(repo, "editor"), []);
    assertEquals(
      await buildUnitFor(repo, "server", "aws"),
      "integrations/aws/server",
    );
    assertEquals(await buildUnitFor(repo, "editor", "aws"), "editor");
    assertEquals(await buildUnitFor(repo, "unlisted", "aws"), "unlisted");
  });
});

Deno.test("integration: a library with no integration for the deploying kit is an error, not a program to run", async () => {
  await inRepo(LIBRARY, async (repo) => {
    await assertRejects(
      () => buildUnitFor(repo, "server", "cloudflare"),
      Error,
      `has none for cloudflare`,
    );
  });
});

Deno.test("config: an app is built as itself or through its integrations, never both and never neither", () => {
  const store = new EnsembleConfigStore("/unused");
  const check = (build: Record<string, unknown>) =>
    store.getAppBuildConfig({ build } as never, "app");
  assertThrows(
    () =>
      check({
        app: { kit: "deno.bundle", integrations: { aws: { kit: "x" } } },
      }),
    Error,
    "never both",
  );
  assertThrows(() => check({ app: {} }), Error, "missing a");
  assertThrows(
    () => check({ app: { integrations: { aws: {} } } }),
    Error,
    `integration for "aws" is missing a "kit"`,
  );
  assertEquals(
    check({ app: { integrations: { aws: { kit: "x" } } } }).integrations,
    { aws: { kit: "x" } },
  );
});

Deno.test("config: what a unit is built with is its app's own build, or the integration's under the app", async () => {
  await inRepo(LIBRARY, async (repo) => {
    const store = new EnsembleConfigStore(repo);
    const config = await store.load();
    assertEquals(store.getUnitBuildConfig(config, "editor"), { kit: "react" });
    assertEquals(store.getUnitBuildConfig(config, "integrations/aws/server"), {
      kit: "deno.bundle",
    });
    assertThrows(
      () => store.getUnitBuildConfig(config, "server"),
      Error,
      "library built through its integrations",
    );
    assertThrows(
      () => store.getUnitBuildConfig(config, "integrations/cloudflare/server"),
      Error,
      `no integration for "cloudflare"`,
    );
  });
});
