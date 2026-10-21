import { assertEquals, assertThrows } from "@std/assert";
import { KeySchemaError, parseKeySchema } from "./key-schema.ts";

Deno.test("parseKeySchema: a partition key alone", () => {
  assertEquals(parseKeySchema({ partition: "PK" }), { partition: "PK" });
});

Deno.test("parseKeySchema: a partition and a sort key", () => {
  assertEquals(parseKeySchema({ partition: "PK", sort: "SK" }), {
    partition: "PK",
    sort: "SK",
  });
});

Deno.test("parseKeySchema: rejects a missing partition key", () => {
  assertThrows(
    () => parseKeySchema({ sort: "SK" }),
    KeySchemaError,
    `"partition"`,
  );
});

Deno.test("parseKeySchema: rejects an unknown key, naming it", () => {
  assertThrows(
    () => parseKeySchema({ partition: "PK", hash: "x" }),
    KeySchemaError,
    `"hash"`,
  );
});

Deno.test("parseKeySchema: rejects a sort key equal to the partition key", () => {
  assertThrows(
    () => parseKeySchema({ partition: "PK", sort: "PK" }),
    KeySchemaError,
    "different",
  );
});

Deno.test("parseKeySchema: rejects a non-mapping", () => {
  assertThrows(() => parseKeySchema("PK"), KeySchemaError, "mapping");
});
