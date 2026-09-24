import { assertEquals, assertRejects } from "@std/assert";
import type { Artifacts } from "../render/artifact.ts";
import { WatchNotSupportedError, WatchRunner } from "./watch-runner.ts";
import {
  EMPTY_ARTIFACTS,
  EMPTY_GRAPH,
  FakeArtifactSink,
  FakePresentingKit,
} from "./test-fakes.ts";

Deno.test("WatchRunner.watch: writes the artifact and runs the kit's watch command until it exits on its own", async () => {
  const sink = new FakeArtifactSink();
  const kit = new FakePresentingKit(
    { filename: "compose.yaml", content: "services: {}\n" },
    ["true"],
    ["true"],
  );
  const runner = new WatchRunner(sink);

  await runner.watch(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit, "phase6-test");

  assertEquals(sink.written, [{
    filename: "compose.yaml",
    content: "services: {}\n",
  }]);
});

Deno.test("WatchRunner.watch: runs the render pass's init commands once the watch command is started — a watch session is an apply too", async () => {
  const dir = await Deno.makeTempDir();
  const seen = `${dir}/seen.txt`;
  try {
    const sink = new FakeArtifactSink("/repo/artifacts/compose.yaml");
    const kit = new FakePresentingKit(
      { filename: "compose.yaml", content: "services: {}\n" },
      ["true"],
      ["true"],
    );
    const artifacts: Artifacts = {
      fragments: [],
      initCommands: [{
        name: "seed",
        run:
          `printf '%s\\n%s\\n' "$ENS_ARTIFACT_PATH" "$ENS_DEPLOYMENT_NAME" > "${seen}"`,
      }],
    };

    await new WatchRunner(sink).watch(
      artifacts,
      EMPTY_GRAPH,
      kit,
      "portal-portal",
    );

    assertEquals(
      await Deno.readTextFile(seen),
      "/repo/artifacts/compose.yaml\nportal-portal\n",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("WatchRunner.watch: throws WatchNotSupportedError when the kit has no watch command", async () => {
  const sink = new FakeArtifactSink();
  const kit = new FakePresentingKit(
    { filename: "compose.yaml", content: "services: {}\n" },
  );
  const runner = new WatchRunner(sink);

  await assertRejects(
    () => runner.watch(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit, "phase6-test"),
    WatchNotSupportedError,
  );
});

Deno.test("WatchRunner.watch: an aborted signal tears the long-lived process down before it would exit on its own", async () => {
  const sink = new FakeArtifactSink();
  // A real process that would otherwise run far longer than this test should
  // take — proves teardown actually happened rather than the process just
  // finishing naturally.
  const kit = new FakePresentingKit(
    { filename: "compose.yaml", content: "services: {}\n" },
    ["true"],
    ["sleep", "30"],
  );
  const runner = new WatchRunner(sink);
  const controller = new AbortController();

  const started = performance.now();
  const watched = runner.watch(
    EMPTY_ARTIFACTS,
    EMPTY_GRAPH,
    kit,
    "phase6-test",
    controller.signal,
  );
  controller.abort();
  await watched;
  const elapsedMs = performance.now() - started;

  // Comfortably under the 30s the stub would otherwise have run for.
  assertEquals(elapsedMs < 5000, true);
});

Deno.test("WatchRunner.watch: an already-aborted signal tears the process down immediately", async () => {
  const sink = new FakeArtifactSink();
  const kit = new FakePresentingKit(
    { filename: "compose.yaml", content: "services: {}\n" },
    ["true"],
    ["sleep", "30"],
  );
  const runner = new WatchRunner(sink);
  const controller = new AbortController();
  controller.abort();

  const started = performance.now();
  await runner.watch(
    EMPTY_ARTIFACTS,
    EMPTY_GRAPH,
    kit,
    "phase6-test",
    controller.signal,
  );
  const elapsedMs = performance.now() - started;

  assertEquals(elapsedMs < 5000, true);
});
