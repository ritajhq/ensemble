import { assertEquals, assertRejects } from "@std/assert";
import type { Artifacts } from "../render/artifact.ts";
import { OutputsLedger } from "../render/outputs-ledger.ts";
import { Applier, ApplyError } from "./applier.ts";
import type { DeployedState } from "./deployed-state.ts";
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

Deno.test("Applier.apply: runs the render pass's init commands after a successful apply, scoped to the artifact it just applied", async () => {
  const dir = await Deno.makeTempDir();
  const seen = `${dir}/seen.txt`;
  try {
    const sink = new FakeArtifactSink("/repo/artifacts/compose.yaml");
    const kit = new FakePresentingKit({
      filename: "compose.yaml",
      content: "services: {}\n",
    }, ["true"]);
    const applier = new Applier(sink, new FakeRenderCache());
    const artifacts: Artifacts = {
      fragments: [],
      initCommands: [{
        name: "seed",
        run:
          `printf '%s\\n%s\\n' "$ENS_ARTIFACT_PATH" "$ENS_DEPLOYMENT_NAME" > "${seen}"`,
      }],
    };

    await applier.apply(artifacts, EMPTY_GRAPH, kit, "portal-portal");

    assertEquals(
      await Deno.readTextFile(seen),
      "/repo/artifacts/compose.yaml\nportal-portal\n",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
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

class RecordingDeployedState implements DeployedState {
  readonly recorded: { ledger: OutputsLedger; artifactPath: string }[] = [];

  record(ledger: OutputsLedger, artifactPath: string): Promise<void> {
    this.recorded.push({ ledger, artifactPath });
    return Promise.resolve();
  }
}

Deno.test("Applier.apply: records the deployment as up, with the render it came from, once the apply has succeeded", async () => {
  const deployed = new RecordingDeployedState();
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "services: {}\n",
  }, ["true"]);
  const applier = new Applier(
    new FakeArtifactSink("/repo/artifacts/compose.yaml"),
    new FakeRenderCache(),
    undefined,
    deployed,
  );
  const ledger = new OutputsLedger();

  await applier.apply(EMPTY_ARTIFACTS, EMPTY_GRAPH, kit, "demo", ledger);

  assertEquals(deployed.recorded, [{
    ledger,
    artifactPath: "/repo/artifacts/compose.yaml",
  }]);
});

Deno.test("Applier.apply: records nothing when the apply fails", async () => {
  const deployed = new RecordingDeployedState();
  const kit = new FakePresentingKit({
    filename: "compose.yaml",
    content: "services: {}\n",
  }, ["false"]);
  const applier = new Applier(
    new FakeArtifactSink(),
    new FakeRenderCache(),
    undefined,
    deployed,
  );

  await assertRejects(
    () =>
      applier.apply(
        EMPTY_ARTIFACTS,
        EMPTY_GRAPH,
        kit,
        "demo",
        new OutputsLedger(),
      ),
    ApplyError,
  );
  assertEquals(deployed.recorded, []);
});
