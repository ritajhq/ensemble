import { assertEquals, assertThrows } from "@std/assert";
import { ContractError } from "../contracts/errors.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import { ContractMatcher } from "./contract-matcher.ts";

const registry = new ContractCatalog([relationalV1]);
const matcher = new ContractMatcher(registry);

Deno.test("ContractMatcher.match: matches a valid resource to its contract", () => {
  const matched = matcher.match("databases", "primary", {
    type: "relational",
    class: "critical",
    params: {
      engine: "postgres",
      version: "16",
      user: "appuser",
      database: "appdb",
      passwordSecret: "db-password",
    },
  });
  assertEquals(matched.category, "databases");
  assertEquals(matched.name, "primary");
  assertEquals(matched.contract, relationalV1);
});

Deno.test("ContractMatcher.match: raises for an unknown type", () => {
  const error = assertThrows(
    () =>
      matcher.match("databases", "primary", { type: "key-value", params: {} }),
    ContractError,
  );
  assertEquals(
    error.message,
    'databases.primary has unknown type "key-value".',
  );
});

Deno.test("ContractMatcher.match: raises for invalid params (delegates to the contract)", () => {
  const error = assertThrows(
    () =>
      matcher.match("databases", "primary", { type: "relational", params: {} }),
    ContractError,
  );
  assertEquals(error.message, 'databases.relational requires param "engine".');
});
