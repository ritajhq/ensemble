import { assertEquals } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { DeclaredValues } from "./declared-values.ts";

const workload = new Parser().parse(`
version: v1
deploy:
  variables:
    gateway-networks: { type: list }
    domain: {}
`);

function resolveWith(name: string, envVar: string, value: string): unknown {
  Deno.env.set(envVar, value);
  try {
    return new DeclaredValues().resolve(
      { category: "variables", name, output: "value" },
      workload,
    );
  } finally {
    Deno.env.delete(envVar);
  }
}

Deno.test("DeclaredValues: a list variable resolves to its trimmed, non-empty comma-separated entries", () => {
  assertEquals(
    resolveWith("gateway-networks", "GATEWAY_NETWORKS", " edge, ,tunnel "),
    ["edge", "tunnel"],
  );
});

Deno.test("DeclaredValues: an empty list variable resolves to an empty list", () => {
  assertEquals(resolveWith("gateway-networks", "GATEWAY_NETWORKS", ""), []);
});

Deno.test("DeclaredValues: an untyped variable resolves to its text as-is", () => {
  assertEquals(resolveWith("domain", "DOMAIN", "a,b"), "a,b");
});
