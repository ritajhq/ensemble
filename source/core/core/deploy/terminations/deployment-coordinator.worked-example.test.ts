import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { containerOrchestratedV1 } from "../contracts/seeds/container-orchestrated.ts";
import { ReferenceResolver } from "../render/reference-resolver.ts";
import { Renderer } from "../render/renderer.ts";
import { ReleaseLocatorResolver } from "../kit/release-locator-resolver.ts";
import { PreresolvedReleaseLocator } from "../kit/release-locator.ts";
import type { PackKitGateway } from "../kit/pack-kit-gateway.ts";
import type { Kit } from "../kit/kit.ts";
import type { Target } from "../kit/target.ts";
import { DeploymentCoordinator } from "./deployment-coordinator.ts";
import { ReleaseAvailabilityPreflight } from "./release-availability-preflight.ts";
import { LocalArtifactsPacker, type ReleasePacker } from "./release-packer.ts";
import { WatchNotSupportedError, WatchRunner } from "./watch-runner.ts";
import { ExternalsEmulator } from "./externals-emulator.ts";
import { Ejector } from "./ejector.ts";
import { Planner } from "./planner.ts";
import { Applier } from "./applier.ts";
import { FakeArtifactSink, FakeRenderCache } from "./test-fakes.ts";

/**
 * Phase 7's worked example: the same manifest shape `ci/website/delivery.yml`
 * uses for real — one release, one compute referencing it, a `development`
 * block — run through the full composition `@ensemble/core`'s `runDeploy`
 * performs (`ReleaseLocatorResolver` → `Renderer` → `DeploymentCoordinator`),
 * with fakes only at the true edges (the pack-kit gateway, the release
 * packer, and the kit's own watch/apply commands) — everything else is the
 * real pipeline. `applyCommand`/`watchCommand` below return real, trivial
 * OS commands (`true`, `sleep`) — `Applier`/`WatchRunner` actually spawn
 * whatever argv a kit returns, so a "fake" invocation here still has to be a
 * real, harmless one.
 */
const MANIFEST = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    server:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      development:
        sync:
          - app: web/server
            path: /app/server
`;

const registry = new ContractCatalog([containerOrchestratedV1]);

/** A minimal, real-ish container-orchestrated provisioner (no relational resource in this manifest, so only this one is needed). Command builders receive `(artifactPath, name)` and own their full return value — no implicit appending — so a `sleep`-based watch command can't have a stray path argument corrupt its duration. */
function fakeKit(
  applyCommand: (path: string, name: string) => readonly string[],
  watchCommand?: (path: string, name: string) => readonly string[],
  onWatchInvoked?: () => void,
): Kit {
  return {
    provisioners: () =>
      Promise.resolve([
        {
          matches: (resource) =>
            Promise.resolve(
              resource.declaration.type === "container-orchestrated",
            ),
          provision: (request) =>
            Promise.resolve({
              fragment: {
                category: request.category,
                name: request.name,
                content: { image: request.params.image },
              },
              outputs: {},
            }),
        },
      ]),
    realization: () =>
      Promise.resolve({
        classPreset: () => Promise.resolve(undefined),
        defaultFor: () => Promise.resolve(undefined),
        boundFor: () => Promise.resolve(undefined),
        supportsCapability: () => Promise.resolve(false),
        knowabilityOf: () => Promise.resolve("static" as const),
      }),
    present: (artifacts) =>
      Promise.resolve({
        filename: "compose.yaml",
        content: JSON.stringify(artifacts.fragments),
      }),
    applyCommand: (path, name) => Promise.resolve(applyCommand(path, name)),
    ...(watchCommand
      ? {
        watchCommand: (path: string, name: string) => {
          onWatchInvoked?.();
          return Promise.resolve(watchCommand(path, name));
        },
      }
      : {}),
  };
}

/** Mirrors core/deploy.ts's own composition: resolve locators via the gateway, build the renderer, then the coordinator — the same shape `runDeploy` uses, just with fakes at the edges. */
async function buildCoordinator(
  kit: Kit,
  artifacts: "local" | "published",
  version: string,
  gateway: PackKitGateway,
  sink: FakeArtifactSink,
  cache: FakeRenderCache,
  packer: ReleasePacker,
) {
  const workload = new Parser().parse(MANIFEST);
  const locatorResolver = new ReleaseLocatorResolver(gateway);
  const releaseLocator = new PreresolvedReleaseLocator(
    await locatorResolver.resolveAll(workload, artifacts, version),
  );
  const renderer = new Renderer(
    new ReferenceResolver(await kit.realization()),
    releaseLocator,
    registry,
  );
  const coordinator = new DeploymentCoordinator(
    registry,
    renderer,
    new Ejector(sink),
    new Planner(cache),
    new Applier(sink, cache),
    new ReleaseAvailabilityPreflight(gateway),
    new LocalArtifactsPacker(packer),
    new WatchRunner(sink),
    new ExternalsEmulator(),
  );
  const target: Target = { kit };
  return { workload, coordinator, target };
}

Deno.test("worked example: ens develop packs the referenced release, bakes the local locator, then watches", async () => {
  const order: string[] = [];
  const gateway: PackKitGateway = {
    describe: (name, _release, artifactsSource) =>
      // The real docker kit's own convention: local → <outputName>:latest.
      Promise.resolve(
        artifactsSource === "local" ? `${name}:latest` : `${name}:published`,
      ),
    verify: () => Promise.resolve({ available: true }),
  };
  const packer: ReleasePacker = {
    pack: (name) => {
      order.push(`pack:${name}`);
      return Promise.resolve();
    },
  };
  const kit = fakeKit(
    () => ["true"],
    () => ["true"],
    () => order.push("watch"),
  );
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();

  const { workload, coordinator, target } = await buildCoordinator(
    kit,
    "local",
    "latest",
    gateway,
    sink,
    cache,
    packer,
  );

  const result = await coordinator.deploy(
    "develop-worked-example",
    workload,
    target,
    {
      artifacts: "local",
      termination: "apply",
      acceptCapabilityGaps: false,
      version: "latest",
      pack: true,
      watch: true,
      emulateExternals: false,
    },
  );

  assertEquals(result, { termination: "apply", gaps: [] });
  assertEquals(order, ["pack:web", "watch"]);
  // The dev locator bakes web:latest into the rendered artifact.
  assertEquals(sink.written[0].content.includes("web:latest"), true);
});

Deno.test("worked example: --artifacts published (no --watch) skips the pack step, preflights, and one-shot-applies", async () => {
  let packCalls = 0;
  let verifyCalls = 0;
  const gateway: PackKitGateway = {
    describe: (name, _release, artifactsSource, version) =>
      Promise.resolve(
        artifactsSource === "local"
          ? `${name}:latest`
          : `registry.example.com/${name}:${version}`,
      ),
    verify: () => {
      verifyCalls++;
      return Promise.resolve({ available: true });
    },
  };
  const packer: ReleasePacker = {
    pack: () => {
      packCalls++;
      return Promise.resolve();
    },
  };
  const kit = fakeKit(() => ["true"]);
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();

  const { workload, coordinator, target } = await buildCoordinator(
    kit,
    "published",
    "1.0.0",
    gateway,
    sink,
    cache,
    packer,
  );

  const result = await coordinator.deploy(
    "published-worked-example",
    workload,
    target,
    {
      artifacts: "published",
      termination: "apply",
      acceptCapabilityGaps: false,
      version: "1.0.0",
      pack: true,
      watch: false,
      emulateExternals: false,
    },
  );

  assertEquals(result, { termination: "apply", gaps: [] });
  assertEquals(packCalls, 0);
  assertEquals(verifyCalls, 1);
  assertEquals(
    sink.written[0].content.includes("registry.example.com/web:1.0.0"),
    true,
  );
});

Deno.test("worked example: a target whose kit has no watch command produces the capability-gap escalation", async () => {
  const gateway: PackKitGateway = {
    describe: (name) => Promise.resolve(`${name}:latest`),
    verify: () => Promise.resolve({ available: true }),
  };
  const packer: ReleasePacker = { pack: () => Promise.resolve() };
  const kit = fakeKit(() => ["true"]); // no watchCommand
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();

  const { workload, coordinator, target } = await buildCoordinator(
    kit,
    "local",
    "latest",
    gateway,
    sink,
    cache,
    packer,
  );

  await assertRejects(
    () =>
      coordinator.deploy("no-watch-worked-example", workload, target, {
        artifacts: "local",
        termination: "apply",
        acceptCapabilityGaps: false,
        version: "latest",
        pack: true,
        watch: true,
        emulateExternals: false,
      }),
    WatchNotSupportedError,
  );
});

// A real-SIGINT test at this level was tried and deliberately dropped:
// `Deno.kill(Deno.pid, "SIGINT")` from inside a `deno test` run doesn't
// scope to this coordinator's own listener — `deno test`'s own runner also
// reacts to SIGINT (Deno signal listeners are additive, not test-isolated),
// so it tears down the whole test process instead of just this test.
// Real-signal teardown is already covered at two other levels instead:
// `watch-runner.test.ts`'s injected-AbortController tests (a real `sleep 30`
// process torn down in ~1-2ms, live-abort and pre-aborted), and the actual
// CLI, live, with a real OS SIGINT (`timeout -s INT 20 ens develop website`
// during Phase 6's report) — a real `docker compose watch` process, killed
// for real, with no orphaned process left behind afterward.
