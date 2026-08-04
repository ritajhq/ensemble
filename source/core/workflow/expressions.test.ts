import { assertEquals, assertThrows } from "@std/assert";
import { evaluate, evaluateCondition, interpolate } from "./expressions.ts";

Deno.test("evaluate: literal equality", () => {
  assertEquals(evaluate("1 == 2", {}), false);
});

Deno.test("evaluate: steps.<id>.outputs.* access", () => {
  const ctx = { steps: { compile: { outputs: { ok: "true" } } } };
  assertEquals(evaluate("steps.compile.outputs.ok", ctx), "true");
});

Deno.test("evaluate: needs.<job>.result access", () => {
  const ctx = { needs: { build: { result: "success" } } };
  assertEquals(evaluate("needs.build.result", ctx), "success");
  assertEquals(evaluate("needs.build.result == 'success'", ctx), true);
});

Deno.test("evaluate: variables.* access", () => {
  const ctx = { variables: { API_URL: "https://example.com" } };
  assertEquals(evaluate("variables.API_URL", ctx), "https://example.com");
});

Deno.test("evaluate: supports both wrapped and bare expressions", () => {
  const ctx = { steps: { a: { outputs: { ok: "true" } } } };
  assertEquals(evaluate("${{ steps.a.outputs.ok == 'true' }}", ctx), true);
  assertEquals(evaluate("steps.a.outputs.ok == 'true'", ctx), true);
});

Deno.test("evaluateCondition: truthy string is true", () => {
  assertEquals(evaluateCondition("'nonempty'", {}), true);
  assertEquals(evaluateCondition("''", {}), false);
});

Deno.test("evaluateCondition: falsy/truthy numbers and booleans", () => {
  assertEquals(evaluateCondition("0", {}), false);
  assertEquals(evaluateCondition("1", {}), true);
  assertEquals(evaluateCondition("false", {}), false);
  assertEquals(evaluateCondition("true", {}), true);
});

Deno.test("evaluateCondition: real if: shape", () => {
  const ctx = { needs: { test: { result: "success" } } };
  assertEquals(evaluateCondition("${{ needs.test.result == 'success' }}", ctx), true);
});

Deno.test("evaluate: unrecognized context name throws loudly", () => {
  assertThrows(() => evaluate("nonexistent.path", { steps: {} }));
});

Deno.test("evaluate: nested array access", () => {
  const ctx = { items: ["a", "b", "c"] };
  assertEquals(evaluate("items[1]", ctx), "b");
});

Deno.test("interpolate: text with no expressions passes through unchanged", () => {
  assertEquals(interpolate("echo hello", {}), "echo hello");
});

Deno.test("interpolate: single expression embedded in literal text", () => {
  const ctx = { variables: { NAME: "world" } };
  assertEquals(interpolate("echo hello ${{ variables.NAME }}", ctx), "echo hello world");
});

Deno.test("interpolate: multiple expressions in one string", () => {
  const ctx = { variables: { A: "1", B: "2" } };
  assertEquals(interpolate("${{ variables.A }}-${{ variables.B }}", ctx), "1-2");
});

Deno.test("interpolate: non-string result is stringified", () => {
  const ctx = { steps: { a: { outputs: { ok: "true" } } } };
  assertEquals(interpolate("result is ${{ steps.a.outputs.ok == 'true' }}", ctx), "result is true");
});
