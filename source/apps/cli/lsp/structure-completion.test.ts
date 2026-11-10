import { assertEquals } from "@std/assert";
import { StructureCompletion } from "./structure-completion.ts";

const completion = new StructureCompletion();

/** The manifest with `|` marking the cursor, and the labels offered there. */
function labelsAt(marked: string, trigger?: string): string[] {
  const lines = marked.split("\n");
  const line = lines.findIndex((text) => text.includes("|"));
  const character = lines[line].indexOf("|");
  const text = marked.replace("|", "");
  return completion.complete(text, { line, character }, trigger)
    .map((item) => item.label);
}

Deno.test("StructureCompletion: the envelope's keys at the root, less those already there", () => {
  assertEquals(labelsAt("version: v1\n|"), [
    "release",
    "deploy",
    "tasks",
    "launch",
  ]);
});

Deno.test("StructureCompletion: a resource's fields from its contract, required first", () => {
  const labels = labelsAt(`version: v1
deploy:
  compute:
    api:
      type: container
      |`);
  assertEquals(labels.includes("image"), true);
  assertEquals(labels.includes("replicas"), true);
  assertEquals(labels.includes("type"), false);
});

Deno.test("StructureCompletion: keeps working while the key being typed doesn't parse", () => {
  const labels = labelsAt(`version: v1
deploy:
  compute:
    api:
      type: container
      rep|`);
  assertEquals(labels.includes("replicas"), true);
});

Deno.test("StructureCompletion: a resource's type values come from its category", () => {
  const labels = labelsAt(
    `version: v1
deploy:
  databases:
    db:
      type: |`,
    " ",
  );
  assertEquals(labels.includes("relational"), true);
  assertEquals(labels.includes("container"), false);
});

Deno.test("StructureCompletion: nothing where the keys are the developer's own names", () => {
  assertEquals(labelsAt("version: v1\ndeploy:\n  compute:\n    |"), []);
});

Deno.test("StructureCompletion: a space typed while indenting suggests nothing", () => {
  assertEquals(labelsAt("version: v1\n|", " "), []);
});

Deno.test("StructureCompletion: replaces what's typed with the key and its colon", () => {
  const items = completion.complete(
    "version: v1\nde",
    { line: 1, character: 2 },
  );
  const deploy = items.find((item) => item.label === "deploy");
  assertEquals(deploy?.textEdit, {
    range: {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 2 },
    },
    newText: "deploy: ",
  });
});
