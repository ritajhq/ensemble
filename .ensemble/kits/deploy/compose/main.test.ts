import { fromFileUrl } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";
import * as KitSdk from "@ensemble/kit-sdk";
import composeKit from "./main.ts";
import { assembleComposeDocument } from "./compose-document.ts";

const FIXTURE = fromFileUrl(
  new URL(
    "../../../../source/core/kit-sdk/deploy/testdata/fixtures/worked-example/delivery.yml",
    import.meta.url,
  ),
);

const registry = new KitSdk.Deploy.Contracts.Catalog([
  KitSdk.Deploy.Contracts.relationalV1,
  KitSdk.Deploy.Contracts.containerOrchestratedV1,
]);

/**
 * Runs the full pipeline (parse → match → select → negotiate → assemble →
 * build graph → render) for one workload against one kit. This is
 * intentionally NOT `DeploymentCoordinator` — that's Phase 6's job ("core owns
 * the loop"); this is test-only glue so Phase 5's `Renderer` can be verified
 * end to end before the real coordinator exists.
 */
async function renderFixture(
  fixturePath: string,
  kit: KitSdk.Deploy.Kit,
  releaseLocator: KitSdk.Deploy.ReleaseLocatorPort,
  artifactsSource: KitSdk.Deploy.ArtifactsSource,
) {
  const loader = new KitSdk.Deploy.Manifest.Loader(
    new KitSdk.Deploy.Manifest.Parser(),
  );
  const workload = await loader.loadFile(fixturePath);
  return renderWorkload(workload, kit, releaseLocator, artifactsSource);
}

// Stays async (render itself is synchronous) so a throw inside is a
// rejection assertRejects() can catch, not an exception escaping the call
// before any promise exists.
// deno-lint-ignore require-await
async function renderWorkload(
  workload: KitSdk.Deploy.Workload,
  kit: KitSdk.Deploy.Kit,
  releaseLocator: KitSdk.Deploy.ReleaseLocatorPort,
  artifactsSource: KitSdk.Deploy.ArtifactsSource,
) {
  const matcher = new KitSdk.Deploy.Resolve.ContractMatcher(registry);
  const selector = new KitSdk.Deploy.Resolve.ProvisionerSelector();
  const negotiator = new KitSdk.Deploy.Resolve.ValueNegotiator();
  const assembler = new KitSdk.Deploy.Resolve.RequestAssembler();
  const target: KitSdk.Deploy.Target = { kit };

  const requests = new Map<string, KitSdk.Deploy.Resolve.ProvisioningRequest>();
  const selections = new Map<
    string,
    KitSdk.Deploy.Resolve.SelectedProvisioner
  >();

  for (const category of ["compute", "databases"] as const) {
    for (
      const [name, declaration] of Object.entries(workload[category] ?? {})
    ) {
      const matched = matcher.match(category, name, declaration);
      const selection = selector.select(matched, target);
      const values = negotiator.negotiate(matched, target);
      const request = assembler.assemble(matched, values);
      requests.set(`${category}.${name}`, request);
      selections.set(`${category}.${name}`, selection);
    }
  }

  const graph = new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build(
    workload,
  );
  const referenceResolver = new KitSdk.Deploy.Render.ReferenceResolver(
    kit.realization(),
  );
  const renderer = new KitSdk.Deploy.Render.Renderer(
    referenceResolver,
    releaseLocator,
    registry,
  );
  const artifacts = renderer.render(
    workload,
    requests,
    selections,
    graph,
    artifactsSource,
  );

  return { artifacts, graph };
}

const releaseLocator = new KitSdk.Deploy.StubReleaseLocator({
  local: { web: { ref: "ens-local/web:dev" } },
  published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
});

Deno.test("compose kit: renders Appendix A's worked example (golden snapshot)", async (t) => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph);

  await assertSnapshot(t, document);
});

Deno.test("compose kit: matches Appendix A's documented content exactly", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, unknown>;
    volumes?: Record<string, unknown>;
  };

  assertEquals(document.services.primary, {
    image: "postgres:16",
    environment: {
      POSTGRES_USER: "appuser",
      POSTGRES_DB: "appdb",
      POSTGRES_PASSWORD: "${DB_PASSWORD}",
    },
    volumes: ["primary-data:/var/lib/postgresql/data"],
    restart: "always",
  });

  assertEquals(document.services.api, {
    image: "ens-local/web:dev",
    depends_on: ["primary"],
    ports: ["8080:8080"],
    environment: {
      DATABASE_URL: "postgres://appuser:${DB_PASSWORD}@primary:5432/appdb",
    },
  });

  assertEquals(document.volumes, { "primary-data": {} });
});

Deno.test("compose kit: a published-artifacts render resolves the release to its published locator instead", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "published",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { image: unknown }>;
  };

  assertEquals(document.services.api.image, "registry.ritaj.app/web:1.4.2");
});

Deno.test("compose kit: present() serializes to compose.yaml, parseable back to the same content", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );

  const presented = composeKit.present(artifacts, graph);
  assertEquals(presented.filename, "compose.yaml");
  assertEquals(presented.content.includes("postgres:16"), true);
});

Deno.test("compose kit: applyCommand runs docker compose up scoped by the deployment's own project name", () => {
  assertEquals(
    composeKit.applyCommand("/tmp/compose.yaml", "phase7-smoke-test"),
    [
      "docker",
      "compose",
      "-f",
      "/tmp/compose.yaml",
      "-p",
      "phase7-smoke-test",
      "up",
      "-d",
    ],
  );
});

Deno.test("compose kit: watchCommand runs docker compose watch scoped by the deployment's own project name, with --project-directory pointed at source/artifacts/ (what the container actually runs)", () => {
  assertEquals(
    composeKit.watchCommand?.(
      "/repo/source/artifacts/deploy/phase7-smoke-test/compose.yaml",
      "phase7-smoke-test",
    ),
    [
      "docker",
      "compose",
      "-f",
      "/repo/source/artifacts/deploy/phase7-smoke-test/compose.yaml",
      "-p",
      "phase7-smoke-test",
      "--project-directory",
      "/repo/source/artifacts",
      "watch",
    ],
  );
});

const WITH_DEVELOPMENT_BLOCK = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      development:
        sync:
          - app: website/server
            path: /app/server
          - app: website/content
            path: /app/content
            action: sync+restart
            ignore: ["*.test.ts"]
`;

Deno.test("compose kit: a development block renders a develop.watch entry per sync rule", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_DEVELOPMENT_BLOCK,
  );
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { develop?: { watch: unknown[] } }>;
  };

  assertEquals(document.services.api.develop, {
    watch: [
      { path: "website/server", target: "/app/server", action: "sync" },
      {
        path: "website/content",
        target: "/app/content",
        action: "sync+restart",
        ignore: ["*.test.ts"],
      },
    ],
  });
});

Deno.test("compose kit: no development block renders no develop key at all", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { develop?: unknown }>;
  };

  assertEquals("develop" in document.services.api, false);
});

Deno.test("compose kit: an invalid development block fails render with a clear error", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_DEVELOPMENT_BLOCK.replace("sync+restart", "rebuild-everything"),
  );

  await assertRejects(
    () => renderWorkload(workload, composeKit, releaseLocator, "local"),
    KitSdk.Deploy.DevelopmentBlockError,
    'must be "sync" or "sync+restart"',
  );
});

Deno.test("compose kit: up -d still applies correctly over a watch-bearing artifact", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_DEVELOPMENT_BLOCK,
  );
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );

  const presented = composeKit.present(artifacts, graph);
  assertEquals(presented.content.includes("develop:"), true);
  assertEquals(presented.content.includes("watch:"), true);
  assertEquals(
    composeKit.applyCommand("/tmp/compose.yaml", "t"),
    ["docker", "compose", "-f", "/tmp/compose.yaml", "-p", "t", "up", "-d"],
  );
});

Deno.test("compose kit: rendering the same workload twice produces byte-identical presented content (G5)", async () => {
  const first = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const second = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );

  assertEquals(
    composeKit.present(first.artifacts, first.graph).content,
    composeKit.present(second.artifacts, second.graph).content,
  );
});
