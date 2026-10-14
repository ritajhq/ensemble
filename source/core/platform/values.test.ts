import { assertEquals } from "@std/assert";
import { Manifest } from "./manifest.ts";
import { Values } from "./values.ts";

const manifest = new Manifest(
  "web",
  ["web"],
  [
    { name: "domain", list: false },
    { name: "replicas", list: false, default: "1" },
  ],
  ["db-password"],
  true,
);

Deno.test("Values: a variable without a default and every secret must be supplied", () => {
  assertEquals(Values.none().missingFor(manifest), ["domain", "db-password"]);
});

Deno.test("Values: what is supplied is no longer missing", () => {
  const values = new Values(
    new Map([["domain", "example.com"]]),
    new Set(["db-password"]),
  );
  assertEquals(values.missingFor(manifest), []);
});

Deno.test("Manifest: says which values it declares", () => {
  assertEquals(manifest.declaresVariable("domain"), true);
  assertEquals(manifest.declaresVariable("db-password"), false);
  assertEquals(manifest.declaresSecret("db-password"), true);
});
