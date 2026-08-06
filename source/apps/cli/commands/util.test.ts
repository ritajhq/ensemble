import { assertEquals, assertThrows } from "@std/assert";
import { ValidationError } from "@cliffy/command";
import { parseInputOverrides, parseVarOverrides } from "./util.ts";

Deno.test("parseVarOverrides: parses KEY=VALUE pairs", () => {
  assertEquals(parseVarOverrides(["FOO=bar", "BAZ=qux"]), { FOO: "bar", BAZ: "qux" });
});

Deno.test("parseVarOverrides: value may itself contain '='", () => {
  assertEquals(parseVarOverrides(["URL=https://example.com?a=1"]), { URL: "https://example.com?a=1" });
});

Deno.test("parseVarOverrides: missing '=' throws ValidationError", () => {
  assertThrows(() => parseVarOverrides(["FOO"]), ValidationError);
});

Deno.test("parseInputOverrides: JSON-parses numbers, booleans, and objects", () => {
  assertEquals(parseInputOverrides(["replicas=3", "enabled=true", 'config={"a":1}']), {
    replicas: 3,
    enabled: true,
    config: { a: 1 },
  });
});

Deno.test("parseInputOverrides: falls back to the raw string when not valid JSON", () => {
  assertEquals(parseInputOverrides(["sha=abc123"]), { sha: "abc123" });
});

Deno.test("parseInputOverrides: missing '=' throws ValidationError", () => {
  assertThrows(() => parseInputOverrides(["sha"]), ValidationError);
});

Deno.test("parseInputOverrides: repeating the same key collects values into a list", () => {
  assertEquals(parseInputOverrides(["job=server", "job=web"]), { job: ["server", "web"] });
});

Deno.test("parseInputOverrides: a key given once still yields a plain scalar, not a single-element list", () => {
  assertEquals(parseInputOverrides(["job=server"]), { job: "server" });
});

Deno.test("parseInputOverrides: repeated values are still individually JSON-parsed", () => {
  assertEquals(parseInputOverrides(["n=1", "n=2"]), { n: [1, 2] });
});
