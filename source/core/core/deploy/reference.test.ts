import { assertEquals } from "@std/assert";
import { ReferenceSyntax } from "./reference.ts";

const syntax = new ReferenceSyntax();

Deno.test("ReferenceSyntax: a whole reference is parsed", () => {
  assertEquals(syntax.parse("${compute.judge.http}"), {
    category: "compute",
    name: "judge",
    output: "http",
  });
});

Deno.test("ReferenceSyntax: a string that starts and ends with a reference holds two, not one malformed one", () => {
  const value = "${compute.a.host}:${compute.a.http}";
  assertEquals(syntax.isWhole(value), false);
  assertEquals(syntax.parse(value), undefined);
  assertEquals(syntax.embedded(value).map((found) => found.text), [
    "${compute.a.host}",
    "${compute.a.http}",
  ]);
});
