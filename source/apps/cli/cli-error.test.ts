import { assertEquals, assertStringIncludes } from "@std/assert";
import * as Core from "@ensemble/core";
import { describeCliError, printCliError } from "./cli-error.ts";

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

Deno.test("describeCliError: a failed kit has said why itself, so there is nothing to add", () => {
  const failure = new Core.KitFailure("Kit failed.", 3, "deno run main.ts");
  assertEquals(describeCliError(failure, false), undefined);
});

Deno.test("describeCliError: debug shows the stack, and a failed kit's command line", () => {
  const failure = new Core.KitFailure("Kit failed.", 3, "deno run main.ts");
  const described = describeCliError(failure, true);
  assertStringIncludes(described!, "cli-error.test.ts");
  assertStringIncludes(described!, "deno run main.ts");
});

Deno.test("describeCliError: a bug in ens keeps its stack without debug", () => {
  for (
    const bug of [new TypeError("x is not a function"), new RangeError("r")]
  ) {
    assertStringIncludes(describeCliError(bug, false)!, "cli-error.test.ts");
  }
});

/** What `printCliError` wrote to stderr for `error`. */
function printed(error: unknown): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (line: string) => lines.push(line);
  try {
    printCliError(error);
  } finally {
    console.error = original;
  }
  return lines;
}

Deno.test("printCliError: a failed kit adds no line to the one the kit printed itself", () => {
  assertEquals(printed(new Core.KitFailure("Kit failed.", 3)), []);
});

Deno.test("printCliError: any other error is one line", () => {
  assertEquals(printed(new Error("no such app")).length, 1);
});
