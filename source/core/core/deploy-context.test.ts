import { assertEquals, assertStrictEquals } from "@std/assert";
import { join } from "@std/path";
import type { ResourceDeclaration, Workload } from "./deploy/index.ts";
import { resolveRelationalInitPaths } from "./deploy-context.ts";

const REPO_ROOT = "/repo";

function relationalDeclaration(
  params: Record<string, unknown>,
): ResourceDeclaration {
  return { type: "relational", params };
}

Deno.test("resolveRelationalInitPaths: resolves a relational resource's init paths relative to repoRoot", () => {
  const workload: Workload = {
    databases: {
      database: relationalDeclaration({
        init: ["ci/portal/db/init-app.sql", "ci/portal/db/init-world.sql.gz"],
      }),
    },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);

  assertEquals(resolved.databases!.database.params.init, [
    join(REPO_ROOT, "ci/portal/db/init-app.sql"),
    join(REPO_ROOT, "ci/portal/db/init-world.sql.gz"),
  ]);
});

Deno.test("resolveRelationalInitPaths: leaves every other param on the resource untouched", () => {
  const workload: Workload = {
    databases: {
      database: relationalDeclaration({
        engine: "postgres",
        version: "16",
        init: ["ci/portal/db/init-app.sql"],
      }),
    },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);

  assertEquals(resolved.databases!.database.params.engine, "postgres");
  assertEquals(resolved.databases!.database.params.version, "16");
});

Deno.test("resolveRelationalInitPaths: a relational resource with no init param is untouched", () => {
  const workload: Workload = {
    databases: {
      database: relationalDeclaration({ engine: "postgres" }),
    },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);
  assertStrictEquals(resolved, workload);
});

Deno.test("resolveRelationalInitPaths: a non-relational database resource is untouched even with an init-shaped param", () => {
  const workload: Workload = {
    databases: {
      cache: { type: "key-value", params: { init: ["not-a-real-thing.sql"] } },
    },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);
  assertStrictEquals(resolved, workload);
});

Deno.test("resolveRelationalInitPaths: a workload with no databases at all is untouched", () => {
  const workload: Workload = {
    compute: { api: { type: "container-orchestrated", params: {} } },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);
  assertStrictEquals(resolved, workload);
});

Deno.test("resolveRelationalInitPaths: only the relational resources with an init param are rebuilt, siblings pass through", () => {
  const workload: Workload = {
    databases: {
      database: relationalDeclaration({ init: ["ci/init.sql"] }),
      cache: { type: "key-value", params: {} },
    },
  };

  const resolved = resolveRelationalInitPaths(workload, REPO_ROOT);
  assertStrictEquals(resolved.databases!.cache, workload.databases!.cache);
});
