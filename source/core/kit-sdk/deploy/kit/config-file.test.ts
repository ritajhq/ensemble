import { assertEquals } from "@std/assert";
import { parseKitConfig } from "./config-file.ts";

Deno.test("parseKitConfig: an empty file yields the empty config", () => {
  assertEquals(parseKitConfig(undefined), {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
    selection: {},
  });
  assertEquals(parseKitConfig(null), {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
    selection: {},
  });
});

Deno.test("parseKitConfig: reads all four sections when present", () => {
  const config = parseKitConfig({
    behavior: { logLevel: "debug" },
    provisioners: [{
      type: "relational",
      implementation: { kind: "command", command: "x" },
    }],
    targetValues: {
      "databases.relational": { bounds: { "read-replicas": { max: 2 } } },
    },
    selection: { runtime: "localstack" },
  });
  assertEquals(config.behavior, { logLevel: "debug" });
  assertEquals(config.provisionerCatalog.provisioners.length, 1);
  assertEquals(config.targetValues["databases.relational"].bounds, {
    "read-replicas": { max: 2 },
  });
  assertEquals(config.selection, { runtime: "localstack" });
});

Deno.test("parseKitConfig: a missing section falls back to its empty default", () => {
  const config = parseKitConfig({ behavior: { logLevel: "debug" } });
  assertEquals(config.provisionerCatalog, { provisioners: [] });
  assertEquals(config.targetValues, {});
  assertEquals(config.selection, {});
});
