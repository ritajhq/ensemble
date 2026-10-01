import { assertEquals } from "@std/assert";
import * as Core from "@ensemble/core";
import { ReferenceCompletion } from "./reference-completion.ts";

const MANIFEST = `version: v1
release:
  web:
    kit: docker
deploy:
  databases:
    db:
      type: relational
  compute:
    api:
      type: container-orchestrated
      image: \${rel
      replicas: 1
tasks:
  migrate:
    run: echo
    arguments:
      ROOT: \${}
`;

const workload = new Core.Deploy.Manifest.Parser().parse(MANIFEST.replace("${rel", "x").replace("${}", "x"));
const completion = new ReferenceCompletion();

function at(needle: string, offset: number) {
  const lines = MANIFEST.split("\n");
  const line = lines.findIndex((l) => l.includes(needle));
  return { line, character: lines[line].indexOf(needle) + offset };
}

Deno.test("ReferenceCompletion: offers workload targets inside an open reference, replacing from ${", () => {
  const items = completion.complete(MANIFEST, at("${rel", 5), workload);
  const labels = items.map((item) => item.label);

  assertEquals(labels.includes("${release.web}"), true);
  assertEquals(labels.includes("${databases.db.host}"), true);
  assertEquals(labels.some((l) => l.startsWith("${deployment.")), false);
  assertEquals(items[0].textEdit && "range" in items[0].textEdit ? items[0].textEdit.range.start.character : -1, at("${rel", 0).character);
});

Deno.test("ReferenceCompletion: adds deployment targets under tasks, and swallows an auto-closed brace", () => {
  const items = completion.complete(MANIFEST, at("${}", 2), workload);
  const labels = items.map((item) => item.label);
  const edit = items[0].textEdit;

  assertEquals(labels.includes("${deployment.root}"), true);
  assertEquals(edit && "range" in edit ? edit.range.end.character : -1, at("${}", 3).character);
});

Deno.test("ReferenceCompletion: offers nothing outside a reference", () => {
  assertEquals(completion.complete(MANIFEST, at("replicas", 3), workload), []);
});
