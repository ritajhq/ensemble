import { assertEquals, assertThrows } from "@std/assert";
import { KeySchemaError } from "../key-schema.ts";
import { CoreOutputs } from "./core-outputs.ts";

const outputs = new CoreOutputs();

Deno.test("CoreOutputs: a key-value table's engine and key attributes come from its negotiation and its keySchema", () => {
  assertEquals(
    outputs.derive("databases.key-value", {
      params: { keySchema: { partition: "PK", sort: "SK" } },
      values: { engine: { value: "dynamodb", provenance: "default" } },
    }),
    { engine: "dynamodb", partition: "PK", sort: "SK" },
  );
  assertEquals(
    outputs.derive("databases.key-value", {
      params: { keySchema: { partition: "id" } },
      values: { engine: { value: "d1", provenance: "pin" } },
    }),
    { engine: "d1", partition: "id", sort: "" },
  );
});

Deno.test("CoreOutputs: an engine nobody resolved is left out for the renderer to report, and an invalid keySchema fails", () => {
  assertEquals(
    outputs.derive("storage.object-storage", { params: {}, values: {} }),
    {},
  );
  assertEquals(outputs.namesFor("storage.object-storage"), ["engine"]);
  assertThrows(
    () =>
      outputs.derive("databases.key-value", {
        params: { keySchema: {} },
        values: {},
      }),
    KeySchemaError,
  );
  assertEquals(outputs.namesFor("compute.function"), []);
});
