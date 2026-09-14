import { fromFileUrl } from "@std/path";
import { assertEquals } from "@std/assert";
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
async function renderWorkload(
  fixturePath: string,
  kit: KitSdk.Deploy.Kit,
  releaseLocator: KitSdk.Deploy.ReleaseLocatorPort,
  mode: KitSdk.Deploy.Mode,
) {
  const loader = new KitSdk.Deploy.Manifest.Loader(
    new KitSdk.Deploy.Manifest.Parser(),
  );
  const workload = await loader.loadFile(fixturePath);

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
      const selection = selector.select(matched, kit);
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
    mode,
  );

  return { artifacts, graph };
}

const releaseLocator = new KitSdk.Deploy.StubReleaseLocator({
  development: { web: { kind: "image", ref: "ens-local/web:dev" } },
  production: { web: { kind: "image", ref: "registry.ritaj.app/web:1.4.2" } },
});

Deno.test("compose kit: renders Appendix A's worked example (golden snapshot)", async (t) => {
  const { artifacts, graph } = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "development",
  );
  const document = assembleComposeDocument(artifacts, graph);

  await assertSnapshot(t, document);
});

Deno.test("compose kit: matches Appendix A's documented content exactly", async () => {
  const { artifacts, graph } = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "development",
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

Deno.test("compose kit: a production-mode render resolves the release to its published locator instead", async () => {
  const { artifacts, graph } = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "production",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { image: unknown }>;
  };

  assertEquals(document.services.api.image, "registry.ritaj.app/web:1.4.2");
});

Deno.test("compose kit: present() serializes to compose.yaml, parseable back to the same content", async () => {
  const { artifacts, graph } = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "development",
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

Deno.test("compose kit: rendering the same workload twice produces byte-identical presented content (G5)", async () => {
  const first = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "development",
  );
  const second = await renderWorkload(
    FIXTURE,
    composeKit,
    releaseLocator,
    "development",
  );

  assertEquals(
    composeKit.present(first.artifacts, first.graph).content,
    composeKit.present(second.artifacts, second.graph).content,
  );
});
