import { assertEquals, assertStringIncludes } from "@std/assert";
import * as Core from "@ensemble/core";
import { describeCliError } from "./cli-error.ts";

Deno.test("describeCliError: an error meant for the person is its message alone", () => {
  assertEquals(
    describeCliError(new Error("no such app"), false),
    "no such app",
  );
  assertEquals(
    describeCliError(new Deno.errors.NotFound("no such file"), false),
    "no such file",
  );
  assertEquals(describeCliError("a string", false), "a string");
});

Deno.test("describeCliError: a failed kit hides its command line", () => {
  const failure = new Core.KitFailure("Kit failed.", 3, "deno run main.ts");
  assertEquals(describeCliError(failure, false), "Kit failed.");
});

Deno.test("describeCliError: debug shows the stack, and a failed kit's command line", () => {
  const failure = new Core.KitFailure("Kit failed.", 3, "deno run main.ts");
  const described = describeCliError(failure, true);
  assertStringIncludes(described, "cli-error.test.ts");
  assertStringIncludes(described, "deno run main.ts");
});

Deno.test("describeCliError: a bug in ens keeps its stack without debug", () => {
  for (
    const bug of [new TypeError("x is not a function"), new RangeError("r")]
  ) {
    assertStringIncludes(describeCliError(bug, false), "cli-error.test.ts");
  }
});
