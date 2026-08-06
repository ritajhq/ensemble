import { assertEquals, assertThrows } from "@std/assert";
import { buildBatches, transitiveDeps, WorkflowCycleError } from "./graph.ts";
import type { Workflow } from "./schema.ts";

function job(needs?: string[]): Workflow["jobs"][string] {
  return { needs, steps: [{ run: "echo hi" }] };
}

Deno.test("buildBatches: linear chain", () => {
  const workflow: Workflow = {
    jobs: { a: job(), b: job(["a"]), c: job(["b"]) },
  };
  assertEquals(buildBatches(workflow), [["a"], ["b"], ["c"]]);
});

Deno.test("buildBatches: fan-out/fan-in", () => {
  const workflow: Workflow = {
    jobs: { a: job(), b: job(["a"]), c: job(["a"]), d: job(["b", "c"]) },
  };
  const batches = buildBatches(workflow);
  assertEquals(batches.length, 3);
  assertEquals(batches[0], ["a"]);
  assertEquals(new Set(batches[1]), new Set(["b", "c"]));
  assertEquals(batches[2], ["d"]);
});

Deno.test("buildBatches: disconnected components", () => {
  const workflow: Workflow = {
    jobs: { a: job(), b: job(), c: job(["a"]), d: job(["b"]) },
  };
  const batches = buildBatches(workflow);
  assertEquals(batches.length, 2);
  assertEquals(new Set(batches[0]), new Set(["a", "b"]));
  assertEquals(new Set(batches[1]), new Set(["c", "d"]));
});

Deno.test("buildBatches: cycle throws", () => {
  const workflow: Workflow = {
    jobs: { a: job(["b"]), b: job(["a"]) },
  };
  assertThrows(() => buildBatches(workflow), WorkflowCycleError);
});

Deno.test("buildBatches: self-cycle throws", () => {
  const workflow: Workflow = { jobs: { a: job(["a"]) } };
  assertThrows(() => buildBatches(workflow), WorkflowCycleError);
});

Deno.test("transitiveDeps: fan-out/fan-in", () => {
  const workflow: Workflow = {
    jobs: { a: job(), b: job(["a"]), c: job(["a"]), d: job(["b", "c"]) },
  };
  assertEquals(transitiveDeps(workflow, "d"), new Set(["b", "c", "a"]));
  assertEquals(transitiveDeps(workflow, "a"), new Set());
});

Deno.test("transitiveDeps: accepts a list of job ids, unioning their deps", () => {
  const workflow: Workflow = {
    jobs: { a: job(), b: job(["a"]), c: job(["a"]), d: job(["b", "c"]) },
  };
  assertEquals(transitiveDeps(workflow, ["b", "c"]), new Set(["a"]));
  assertEquals(transitiveDeps(workflow, ["d"]), new Set(["b", "c", "a"]));
});
