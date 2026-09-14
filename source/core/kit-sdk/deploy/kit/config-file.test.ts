import { assertEquals } from "@std/assert";
import { parseKitConfig } from "./config-file.ts";

Deno.test("parseKitConfig: an empty file yields the empty config", () => {
  assertEquals(parseKitConfig(undefined), {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
  });
  assertEquals(parseKitConfig(null), {
    behavior: {},
    provisionerCatalog: { provisioners: [] },
    targetValues: {},
  });
});

Deno.test("parseKitConfig: reads all three sections when present", () => {
  const config = parseKitConfig({
    behavior: { logLevel: "debug" },
    provisioners: [{
      type: "relational",
      implementation: { kind: "command", command: "x" },
    }],
    targetValues: {
      "databases.relational": { bounds: { "read-replicas": { max: 2 } } },
    },
  });
  assertEquals(config.behavior, { logLevel: "debug" });
  assertEquals(config.provisionerCatalog.provisioners.length, 1);
  assertEquals(config.targetValues["databases.relational"].bounds, {
    "read-replicas": { max: 2 },
  });
});

Deno.test("parseKitConfig: a missing section falls back to its empty default", () => {
  const config = parseKitConfig({ behavior: { logLevel: "debug" } });
  assertEquals(config.provisionerCatalog, { provisioners: [] });
  assertEquals(config.targetValues, {});
});
