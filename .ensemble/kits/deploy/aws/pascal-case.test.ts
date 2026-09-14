import { assertEquals } from "@std/assert";
import { pascalCase } from "./pascal-case.ts";

Deno.test("pascalCase: capitalizes a single word", () => {
  assertEquals(pascalCase("primary"), "Primary");
});

Deno.test("pascalCase: joins hyphenated segments", () => {
  assertEquals(pascalCase("db-password"), "DbPassword");
});

Deno.test("pascalCase: joins underscore-separated segments", () => {
  assertEquals(pascalCase("api_server"), "ApiServer");
});

Deno.test("pascalCase: already-capitalized input is idempotent", () => {
  assertEquals(pascalCase("Primary"), "Primary");
});
