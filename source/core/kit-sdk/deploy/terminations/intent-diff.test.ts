import { assertEquals } from "@std/assert";
import { IntentDiffer } from "./intent-diff.ts";

const differ = new IntentDiffer();

Deno.test("IntentDiffer.diff: no previous cache reports every line as added", () => {
  const diff = differ.diff(undefined, "a\nb");
  assertEquals(diff.lines, [{ kind: "added", text: "a" }, {
    kind: "added",
    text: "b",
  }]);
  assertEquals(diff.changed, true);
});

Deno.test("IntentDiffer.diff: identical content is entirely unchanged", () => {
  const diff = differ.diff("a\nb\nc", "a\nb\nc");
  assertEquals(diff.lines, [
    { kind: "unchanged", text: "a" },
    { kind: "unchanged", text: "b" },
    { kind: "unchanged", text: "c" },
  ]);
  assertEquals(diff.changed, false);
});

Deno.test("IntentDiffer.diff: a changed line in the middle reports the surrounding lines unchanged", () => {
  const diff = differ.diff("a\nb\nc", "a\nx\nc");
  assertEquals(diff.lines, [
    { kind: "unchanged", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "added", text: "x" },
    { kind: "unchanged", text: "c" },
  ]);
  assertEquals(diff.changed, true);
});

Deno.test("IntentDiffer.diff: an appended line reports only that line as added", () => {
  const diff = differ.diff("a\nb", "a\nb\nc");
  assertEquals(diff.lines, [
    { kind: "unchanged", text: "a" },
    { kind: "unchanged", text: "b" },
    { kind: "added", text: "c" },
  ]);
});

Deno.test("IntentDiffer.diff: a removed line reports only that line as removed", () => {
  const diff = differ.diff("a\nb\nc", "a\nc");
  assertEquals(diff.lines, [
    { kind: "unchanged", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "unchanged", text: "c" },
  ]);
});

Deno.test("IntentDiffer.diff: empty previous and empty current report no lines", () => {
  const diff = differ.diff("", "");
  assertEquals(diff.lines, [{ kind: "unchanged", text: "" }]);
  assertEquals(diff.changed, false);
});
