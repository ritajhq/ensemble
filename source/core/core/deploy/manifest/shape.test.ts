import { assertEquals } from "@std/assert";
import { parse } from "@std/yaml";
import { Shape } from "./shape.ts";

const shape = new Shape();
const root = parse(`version: v1
deploy:
  databases:
    db:
      type: relational
  secrets:
    token:
      source: environment
`);

function names(path: (string | number)[]): string[] {
  return shape.keysAt(path, root).map((key) => key.name);
}

Deno.test("Shape.keysAt: the envelope's keys at the root, version required", () => {
  assertEquals(names([]), ["version", "release", "deploy", "operations", "launch"]);
  assertEquals(shape.keysAt([], root)[0].required, true);
});

Deno.test("Shape.keysAt: a resource's common keys, then its contract's params by its type", () => {
  const keys = shape.keysAt(["deploy", "databases", "db"], root);
  assertEquals(keys.slice(0, 3).map((key) => key.name), [
    "type",
    "class",
    "capabilities",
  ]);
  const engine = keys.find((key) => key.name === "engine");
  assertEquals(engine?.required, true);
  assertEquals(keys.some((key) => key.name === "passwordSecret"), true);
});

Deno.test("Shape.keysAt: a resource with no type yet offers only the common keys", () => {
  assertEquals(names(["deploy", "compute", "api"]), [
    "type",
    "class",
    "capabilities",
  ]);
});

Deno.test("Shape.keysAt: secrets have their own keys, and developer-named maps have none", () => {
  assertEquals(names(["deploy", "secrets", "token"]), [
    "source",
    "description",
  ]);
  assertEquals(names(["deploy", "compute"]), []);
  assertEquals(names(["deploy", "compute", "api", "env"]), []);
});

Deno.test("Shape.valuesAt: a resource's types come from its category's contracts", () => {
  const types = shape.valuesAt(["deploy", "databases", "db", "type"], root);
  assertEquals(types.includes("relational"), true);
  assertEquals(types.includes("key-value"), true);
  assertEquals(types.includes("container"), false);
});

Deno.test("Shape.valuesAt: closed vocabularies for version, secret source and launch type", () => {
  assertEquals(shape.valuesAt(["version"], root), ["v1"]);
  assertEquals(
    shape.valuesAt(["deploy", "secrets", "token", "source"], root),
    ["environment", "file"],
  );
  assertEquals(
    shape.valuesAt(["launch", "app", "type"], root).length > 0,
    true,
  );
  assertEquals(shape.valuesAt(["deploy", "compute", "api", "image"], root), []);
});
