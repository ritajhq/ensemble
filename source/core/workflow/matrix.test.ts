import { assertEquals } from "@std/assert";
import { expandMatrix } from "./matrix.ts";

Deno.test("expandMatrix: single key", () => {
  assertEquals(expandMatrix({ os: ["linux", "mac"] }), [
    { os: "linux" },
    { os: "mac" },
  ]);
});

Deno.test("expandMatrix: single key, single value", () => {
  assertEquals(expandMatrix({ os: ["linux"] }), [{ os: "linux" }]);
});

Deno.test("expandMatrix: two keys, declared order preserved", () => {
  const result = expandMatrix({ os: ["linux", "mac"], node: [18, 20] });
  assertEquals(result, [
    { os: "linux", node: 18 },
    { os: "linux", node: 20 },
    { os: "mac", node: 18 },
    { os: "mac", node: 20 },
  ]);
});

Deno.test("expandMatrix: keys of differing lengths", () => {
  const result = expandMatrix({ component: ["api", "web", "worker"], env: ["prod"] });
  assertEquals(result, [
    { component: "api", env: "prod" },
    { component: "web", env: "prod" },
    { component: "worker", env: "prod" },
  ]);
});

Deno.test("expandMatrix: no keys yields one empty combination", () => {
  assertEquals(expandMatrix({}), [{}]);
});

Deno.test("expandMatrix: three keys, cardinality is the product of axis lengths", () => {
  const result = expandMatrix({ a: [1, 2], b: ["x", "y"], c: [true, false] });
  assertEquals(result.length, 8);
});
