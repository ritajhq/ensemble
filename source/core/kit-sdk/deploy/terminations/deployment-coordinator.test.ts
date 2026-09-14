import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { containerOrchestratedV1 } from "../contracts/seeds/container-orchestrated.ts";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import { ReferenceResolver } from "../render/reference-resolver.ts";
import { Renderer } from "../render/renderer.ts";
import { StubReleaseLocator } from "../kit/release-locator.ts";
import type { Kit } from "../kit/kit.ts";
import type { Target } from "../kit/target.ts";
import { FakeRealization } from "../resolve/test-fakes.ts";
import {
  CapabilityGapError,
  DeploymentCoordinator,
} from "./deployment-coordinator.ts";
import { Ejector } from "./ejector.ts";
import { Planner } from "./planner.ts";
import { Applier } from "./applier.ts";
import { FakeArtifactSink, FakeRenderCache } from "./test-fakes.ts";

const APPENDIX_A = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 2
      env:
        DATABASE_URL: \${databases.primary.url}
  databases:
    primary:
      type: relational
      class: critical
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`;

const registry = new ContractCatalog([relationalV1, containerOrchestratedV1]);
const realization = new FakeRealization();

/** A minimal fake `Kit` with real (if trivial) provisioners, so the coordinator's full deploy() pipeline can actually render something, plus `present`/`applyCommand` so eject/plan/apply have somewhere to go. */
function fakeKit(
  presentedContent: string,
  applyCommand: readonly string[] = ["true"],
): Kit {
  return {
    provisioners: () => [
      {
        matches: (resource) => resource.declaration.type === "relational",
        provision: (request) => ({
          fragment: {
            category: request.category,
            name: request.name,
            content: {},
          },
          outputs: {
            host: request.name,
            port: 5432,
            user: request.params.user,
            database: request.params.database,
            url: "u",
          },
        }),
      },
      {
        matches: (resource) =>
          resource.declaration.type === "container-orchestrated",
        provision: (request) => ({
          fragment: {
            category: request.category,
            name: request.name,
            content: {},
          },
          outputs: {},
        }),
      },
    ],
    realization: () => realization,
    present: () => ({ filename: "compose.yaml", content: presentedContent }),
    applyCommand: (path) => [...applyCommand, path],
  };
}

function buildCoordinator(
  kit: Kit,
  sink: FakeArtifactSink,
  cache: FakeRenderCache,
) {
  const releaseLocator = new StubReleaseLocator({
    development: { web: { kind: "image", ref: "ens-local/web:dev" } },
    production: { web: { kind: "image", ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const renderer = new Renderer(
    new ReferenceResolver(kit.realization()),
    releaseLocator,
    registry,
  );
  return new DeploymentCoordinator(
    registry,
    renderer,
    new Ejector(sink),
    new Planner(cache),
    new Applier(sink, cache),
  );
}

async function deployAppendixA(
  kit: Kit,
  termination: "eject" | "plan" | "apply",
  acceptCapabilityGaps = false,
  manifest = APPENDIX_A,
) {
  const workload = new Parser().parse(manifest);
  const sink = new FakeArtifactSink();
  const cache = new FakeRenderCache();
  const coordinator = buildCoordinator(kit, sink, cache);
  const target: Target = { kit };
  const result = await coordinator.deploy("phase6-test", workload, target, {
    mode: "development",
    termination,
    acceptCapabilityGaps,
  });
  return { result, sink, cache };
}

Deno.test("DeploymentCoordinator.deploy: eject presents the render and writes it via the sink", async () => {
  const { result, sink } = await deployAppendixA(
    fakeKit("ejected content"),
    "eject",
  );

  assertEquals(result, {
    termination: "eject",
    artifact: { filename: "compose.yaml", content: "ejected content" },
    gaps: [],
  });
  assertEquals(sink.written, [{
    filename: "compose.yaml",
    content: "ejected content",
  }]);
});

Deno.test("DeploymentCoordinator.deploy: plan reports the intent-diff and caches the render", async () => {
  const { result, cache } = await deployAppendixA(
    fakeKit("planned content"),
    "plan",
  );

  assertEquals(result.termination, "plan");
  assertEquals(await cache.readLast(), "planned content");
});

Deno.test("DeploymentCoordinator.deploy: apply runs the kit's apply command and updates the cache", async () => {
  const { cache } = await deployAppendixA(fakeKit("applied content"), "apply");

  assertEquals(await cache.readLast(), "applied content");
});

Deno.test("DeploymentCoordinator.deploy: a capability gap hard-fails by default", async () => {
  const manifest = APPENDIX_A.replace(
    "class: critical",
    "class: critical\n      capabilities: { read-replicas: 2 }",
  );

  await assertRejects(
    () => deployAppendixA(fakeKit("x"), "eject", false, manifest),
    CapabilityGapError,
  );
});

Deno.test("DeploymentCoordinator.deploy: acceptCapabilityGaps lets a gap through and reports it in the result", async () => {
  const manifest = APPENDIX_A.replace(
    "class: critical",
    "class: critical\n      capabilities: { read-replicas: 2 }",
  );

  const { result } = await deployAppendixA(
    fakeKit("x"),
    "eject",
    true,
    manifest,
  );

  assertEquals(result.gaps, [{
    resource: "databases.primary",
    gap: { capability: "read-replicas", requested: 2 },
  }]);
});
