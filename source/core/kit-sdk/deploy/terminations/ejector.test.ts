import { assertEquals } from "@std/assert";
import { Ejector } from "./ejector.ts";
import {
  EMPTY_ARTIFACTS,
  EMPTY_GRAPH,
  FakeArtifactSink,
  FakePresentingKit,
} from "./test-fakes.ts";

Deno.test("Ejector.eject: presents the artifact via the kit and writes it via the sink", async () => {
  const sink = new FakeArtifactSink();
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "services: {}\n",
  });
  const ejector = new Ejector(sink);

  const presented = await ejector.eject(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit);

  assertEquals(presented, {
    filename: "compose.yaml",
    content: "services: {}\n",
  });
  assertEquals(sink.written, [presented]);
});
