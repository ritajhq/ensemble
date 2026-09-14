import { assertEquals } from "@std/assert";
import { Planner } from "./planner.ts";
import {
  EMPTY_ARTIFACTS,
  EMPTY_GRAPH,
  FakePresentingKit,
  FakeRenderCache,
} from "./test-fakes.ts";

Deno.test("Planner.plan: with no prior cache, reports the whole artifact as new and caches it", async () => {
  const cache = new FakeRenderCache();
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "a\nb",
  });
  const planner = new Planner(cache);

  const diff = await planner.plan(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit);

  assertEquals(diff.changed, true);
  assertEquals(diff.lines, [{ kind: "added", text: "a" }, {
    kind: "added",
    text: "b",
  }]);
  assertEquals(await cache.readLast(), "a\nb");
});

Deno.test("Planner.plan: an unchanged render reports no changes", async () => {
  const cache = new FakeRenderCache("a\nb");
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "a\nb",
  });
  const planner = new Planner(cache);

  const diff = await planner.plan(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit);

  assertEquals(diff.changed, false);
});

Deno.test("Planner.plan: updates the cache to this render, so a later plan diffs against it", async () => {
  const cache = new FakeRenderCache("a");
  const planner = new Planner(cache);

  await planner.plan(
    EMPTY_ARTIFACTS,
    EMPTY_GRAPH,
    new FakePresentingKit({ filename: "x", content: "b" }),
  );
  const secondDiff = await planner.plan(
    EMPTY_ARTIFACTS,
    EMPTY_GRAPH,
    new FakePresentingKit({ filename: "x", content: "b" }),
  );

  assertEquals(secondDiff.changed, false);
});
