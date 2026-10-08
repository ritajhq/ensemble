import { assertEquals } from "@std/assert";
import { Parser } from "./parser.ts";
import { resolveResourceNames } from "./resource-names.ts";

const parser = new Parser();

Deno.test("resolveResourceNames: a workload with no databases or storage yields nothing", () => {
  const workload = parser.parse(`version: v1`);
  assertEquals(resolveResourceNames(workload, "pr-42"), {
    databaseSchemas: {},
    storagePrefixes: {},
  });
});

Deno.test("resolveResourceNames: every database gets a schema named <resource>__<slug>", () => {
  const workload = parser.parse(`
version: v1
deploy:
  databases:
    database: { type: relational, engine: postgres }
`);
  assertEquals(resolveResourceNames(workload, "pr-42"), {
    databaseSchemas: { database: "database__pr-42" },
    storagePrefixes: {},
  });
});

Deno.test("resolveResourceNames: an object-storage entry gets a prefix named <slug>/, a volume entry gets nothing", () => {
  const workload = parser.parse(`
version: v1
deploy:
  storage:
    bucket: { type: object-storage, bucket: portal }
    uploads: { type: volume }
`);
  assertEquals(resolveResourceNames(workload, "pr-42"), {
    databaseSchemas: {},
    storagePrefixes: { bucket: "pr-42/" },
  });
});

Deno.test("resolveResourceNames: a different slug produces a different name, for both kinds", () => {
  const workload = parser.parse(`
version: v1
deploy:
  databases:
    database: { type: relational }
  storage:
    bucket: { type: object-storage }
`);
  assertEquals(resolveResourceNames(workload, "feature-login"), {
    databaseSchemas: { database: "database__feature-login" },
    storagePrefixes: { bucket: "feature-login/" },
  });
});
