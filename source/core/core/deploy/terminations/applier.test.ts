import { assertEquals, assertRejects } from "@std/assert";
import { Applier, ApplyError } from "./applier.ts";
import {
  EMPTY_ARTIFACTS,
  EMPTY_GRAPH,
  FakeArtifactSink,
  FakePresentingKit,
  FakeRenderCache,
} from "./test-fakes.ts";

Deno.test("Applier.apply: writes the artifact, runs the kit's apply command, and updates the cache on success", async () => {
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "services: {}\n",
  }, ["true"]);
  const applier = new Applier(sink, cache);

  await applier.apply(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit, "phase6-test");

  assertEquals(sink.written, [{
    filename: "compose.yaml",
    content: "services: {}\n",
  }]);
  assertEquals(await cache.readLast(), "services: {}\n");
});

Deno.test("Applier.apply: throws ApplyError and leaves the cache untouched when the apply command fails", async () => {
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache("previous");
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "services: {}\n",
  }, ["false"]);
  const applier = new Applier(sink, cache);

  await assertRejects(
    () => applier.apply(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit, "phase6-test"),
    ApplyError,
  );
  assertEquals(await cache.readLast(), "previous");
});
