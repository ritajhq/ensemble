import { assertEquals, assertStrictEquals } from "@std/assert";
import { ContractCatalog } from "./registry.ts";
import { containerOrchestratedV1 } from "./seeds/container-orchestrated.ts";
import { relationalV1 } from "./seeds/relational.ts";

Deno.test("ContractCatalog: looks up a seeded contract by category and type", () => {
  const catalog = new ContractCatalog([relationalV1, containerOrchestratedV1]);
  assertStrictEquals(
    catalog.contractFor("databases", "relational"),
    relationalV1,
  );
  assertStrictEquals(
    catalog.contractFor("compute", "container-orchestrated"),
    containerOrchestratedV1,
  );
});

Deno.test("ContractCatalog: returns undefined for an unseeded type, never throws", () => {
  const catalog = new ContractCatalog([relationalV1]);
  assertEquals(
    catalog.contractFor("compute", "container-orchestrated"),
    undefined,
  );
  assertEquals(catalog.contractFor("databases", "key-value"), undefined);
});
