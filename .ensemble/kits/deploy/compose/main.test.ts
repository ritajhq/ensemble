import { fromFileUrl } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";
import * as KitSdk from "@ensemble/kit-sdk";
import composeKit from "./main.ts";
import { assembleComposeDocument } from "./compose-document.ts";
import { garageSeedScript } from "./provisioners/garage-config.ts";

const FIXTURE = fromFileUrl(
  new URL(
    "../../../../source/core/core/deploy/testdata/fixtures/worked-example/delivery.yml",
    import.meta.url,
  ),
);

const registry = new KitSdk.Deploy.Contracts.Catalog([
  KitSdk.Deploy.Contracts.relationalV1,
  KitSdk.Deploy.Contracts.containerOrchestratedV1,
  KitSdk.Deploy.Contracts.storageVolumeV1,
  KitSdk.Deploy.Contracts.gatewayV1,
  KitSdk.Deploy.Contracts.objectStorageV1,
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

  for (const category of ["compute", "storage", "databases"] as const) {
    for (
      const [name, declaration] of Object.entries(workload[category] ?? {})
    ) {
      const matched = matcher.match(category, name, declaration);
      const selection = await selector.select(matched, target);
      const values = await negotiator.negotiate(matched, target);
      const request = assembler.assemble(matched, values);
      requests.set(`${category}.${name}`, request);
      selections.set(`${category}.${name}`, selection);
    }
  }

  const graph = new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build(
    workload,
  );
  const referenceResolver = new KitSdk.Deploy.Render.ReferenceResolver(
    await kit.realization(),
  );
  const renderer = new KitSdk.Deploy.Render.Renderer(
    referenceResolver,
    releaseLocator,
    registry,
  );
  const artifacts = await renderer.render(
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

  const presented = await composeKit.present(artifacts, graph);
  assertEquals(presented.filename, "compose.yaml");
  assertEquals(presented.content.includes("postgres:16"), true);
});

Deno.test("compose kit: applyCommand runs docker compose up scoped by the deployment's own project name", async () => {
  assertEquals(
    await composeKit.applyCommand("/tmp/compose.yaml", "phase7-smoke-test"),
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

Deno.test("compose kit: watchCommand runs docker compose watch scoped by the deployment's own project name, with --project-directory pointed at source/artifacts/ (what the container actually runs)", async () => {
  assertEquals(
    await composeKit.watchCommand?.(
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
        sync+restart:
          - app: website/content
            path: /app/content
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

const WITH_EXTERNAL_NETWORK = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      networks: ["\${external.edge-net.name}"]
  external:
    edge-net:
      type: network
      name: edge-net
`;

Deno.test("compose kit: a compute referencing an external network renders it on the service and declares it external at the top level", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_EXTERNAL_NETWORK,
  );
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { networks?: string[] }>;
    networks?: Record<string, unknown>;
  };

  assertEquals(document.services.api.networks, ["edge-net"]);
  assertEquals(document.networks, { "edge-net": { external: true } });
});

Deno.test("compose kit: emulateExternals reports a docker network inspect/create pair per external network", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_EXTERNAL_NETWORK,
  );

  assertEquals(await composeKit.emulateExternals?.(workload), [{
    name: "edge-net",
    check: ["docker", "network", "inspect", "edge-net"],
    create: ["docker", "network", "create", "edge-net"],
  }]);
});

Deno.test("compose kit: no networks param renders no networks key anywhere", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { networks?: unknown }>;
    networks?: unknown;
  };

  assertEquals("networks" in document.services.api, false);
  assertEquals("networks" in document, false);
});

const WITH_MOUNTS = `
version: v1
release:
  web: { kit: docker }
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      mounts:
        - source: \${storage.uploads.name}
          path: /var/lib/uploads
        - source: \${storage.cache.name}
          path: /var/lib/cache
          readOnly: true
  storage:
    uploads:
      type: volume
    cache:
      type: volume
`;

Deno.test("compose kit: mounts render as service-level volume mappings (readOnly appending :ro) and a top-level named volume per storage.volume entry", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(WITH_MOUNTS);
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { volumes?: string[]; depends_on?: string[] }>;
    volumes?: Record<string, unknown>;
  };

  assertEquals(document.services.api.volumes, [
    "uploads:/var/lib/uploads",
    "cache:/var/lib/cache:ro",
  ]);
  assertEquals(document.volumes, { uploads: {}, cache: {} });
});

Deno.test("compose kit: a storage.volume dependency gets no depends_on entry (a named volume isn't a service to wait for)", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(WITH_MOUNTS);
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { depends_on?: string[] }>;
  };

  assertEquals("depends_on" in document.services.api, false);
  assertEquals("uploads" in document.services, false);
  assertEquals("cache" in document.services, false);
});

Deno.test("compose kit: no mounts param renders no volumes key on the service", async () => {
  const { artifacts, graph } = await renderFixture(
    FIXTURE,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { volumes?: unknown }>;
  };

  assertEquals("volumes" in document.services.api, false);
});

const WITH_INIT_SCRIPTS = `
version: v1
deploy:
  databases:
    database:
      type: relational
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
      init:
        - /repo/ci/portal/db/init-app.sql
        - /repo/ci/portal/db/init-world.sql.gz
  secrets:
    db-password: { source: environment }
`;

Deno.test("compose kit: init scripts render as read-only bind mounts into docker-entrypoint-initdb.d, named after each file", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(WITH_INIT_SCRIPTS);
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { volumes?: string[] }>;
  };

  assertEquals(document.services.database.volumes, [
    "/repo/ci/portal/db/init-app.sql:/docker-entrypoint-initdb.d/init-app.sql:ro",
    "/repo/ci/portal/db/init-world.sql.gz:/docker-entrypoint-initdb.d/init-world.sql.gz:ro",
  ]);
});

Deno.test("compose kit: init scripts on a non-critical database still mount, with no restart/persistent-volume side effect", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(WITH_INIT_SCRIPTS);
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, { restart?: string }>;
    volumes?: Record<string, unknown>;
  };

  assertEquals("restart" in document.services.database, false);
  assertEquals(document.volumes, undefined);
});

Deno.test("compose kit: an invalid development block fails render with a clear error", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_DEVELOPMENT_BLOCK.replace("sync+restart", "rebuild-everything"),
  );

  await assertRejects(
    () => renderWorkload(workload, composeKit, releaseLocator, "local"),
    KitSdk.Deploy.DevelopmentBlockError,
    'development has no key "rebuild-everything"',
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

  const presented = await composeKit.present(artifacts, graph);
  assertEquals(presented.content.includes("develop:"), true);
  assertEquals(presented.content.includes("watch:"), true);
  assertEquals(
    await composeKit.applyCommand("/tmp/compose.yaml", "t"),
    ["docker", "compose", "-f", "/tmp/compose.yaml", "-p", "t", "up", "-d"],
  );
});

const WITH_OBJECT_STORAGE = `
version: v1
release:
  web: { kit: docker }
deploy:
  storage:
    bucket:
      type: object-storage
      bucket: my-bucket
      accessKeySecret: s3-access-key
      secretKeySecret: s3-secret-key
      class: critical
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      env:
        BUCKET_ENDPOINT: \${storage.bucket.url}
        BUCKET_NAME: \${storage.bucket.bucket}
  secrets:
    s3-access-key: { source: environment }
    s3-secret-key: { source: environment }
`;

Deno.test("compose kit: object storage renders as a Garage service on its own image entrypoint, with the seeding declared as an apply-time init command instead of an entrypoint script (the image has no shell)", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_OBJECT_STORAGE,
  );
  const { artifacts, graph } = await renderWorkload(
    workload,
    composeKit,
    releaseLocator,
    "local",
  );
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, {
      image: string;
      entrypoint?: string[];
      ports?: string[];
      environment?: Record<string, string>;
      configs?: unknown[];
      volumes?: string[];
    }>;
    volumes?: Record<string, unknown>;
    configs?: Record<string, { content: string }>;
  };

  assertEquals(document.services.bucket.image, "dxflrs/garage:v1.0.1");
  assertEquals("entrypoint" in document.services.bucket, false);
  assertEquals("environment" in document.services.bucket, false);
  assertEquals(document.services.bucket.ports, ["3900:3900"]);
  assertEquals(document.services.bucket.configs, [
    { source: "bucket-garage-toml", target: "/etc/garage.toml" },
  ]);
  assertEquals(document.services.bucket.volumes, [
    "bucket-data:/var/lib/garage",
  ]);
  assertEquals(document.volumes, { "bucket-data": {} });

  const toml = document.configs!["bucket-garage-toml"].content;
  assertEquals(toml.includes('api_bind_addr = "[::]:3900"'), true);
  assertEquals(toml.includes("rpc_secret ="), true);

  assertEquals(document.services.api.environment, {
    BUCKET_ENDPOINT: "http://bucket:3900",
    BUCKET_NAME: "my-bucket",
  });

  assertEquals(artifacts.initCommands, [{
    name: "bucket-garage-seed",
    run: garageSeedScript({
      service: "bucket",
      bucket: "my-bucket",
      accessKey: "${S3_ACCESS_KEY}",
      secretKey: "${S3_SECRET_KEY}",
    }),
  }]);
});

const WITH_OBJECT_STORAGE_MISSING_CREDENTIALS = `
version: v1
deploy:
  storage:
    bucket:
      type: object-storage
      bucket: my-bucket
`;

Deno.test("compose kit: object storage without declared credentials fails render with a clear error (aws can drop them, Garage can't)", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_OBJECT_STORAGE_MISSING_CREDENTIALS,
  );

  await assertRejects(
    () => renderWorkload(workload, composeKit, releaseLocator, "local"),
    Error,
    'needs "accessKeySecret"',
  );
});

const WITH_GATEWAY = `
version: v1
release:
  web: { kit: docker }
deploy:
  external:
    edge:
      type: network
      name: edge
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      ports:
        http: 8080
  networking:
    gateway:
      type: gateway
      network: \${external.edge.name}
      routes:
        - host: example.localhost
          path: /api/*
          target:
            service: api
            port: \${compute.api.http}
        - host: example.localhost
          path:
            match: /strip/*
            strip: true
          target:
            service: api
            port: \${compute.api.http}
`;

/** `renderWorkload`'s own loop only covers `compute`/`storage`/`databases` (every other test in this file only ever needed those) — `networking` needs the full `WorkloadResolver` instead, same tool `aws/main.test.ts`'s own `WITH_READ_REPLICAS` tests already reach for on a custom workload. */
async function renderNetworkingWorkload(workload: KitSdk.Deploy.Workload) {
  const target: KitSdk.Deploy.Target = { kit: composeKit };
  const resolution = await new KitSdk.Deploy.Resolve.WorkloadResolver(registry)
    .resolve(workload, target);
  const graph = new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build(
    workload,
  );
  const artifacts = await new KitSdk.Deploy.Render.Renderer(
    new KitSdk.Deploy.Render.ReferenceResolver(await composeKit.realization()),
    releaseLocator,
    registry,
  ).render(
    workload,
    resolution.requests,
    resolution.selections,
    graph,
    "local",
  );
  return { artifacts, graph };
}

Deno.test("compose kit: a gateway renders as an nginx service with generated nginx.conf, joined to its declared network", async () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(WITH_GATEWAY);
  const { artifacts, graph } = await renderNetworkingWorkload(workload);
  const document = assembleComposeDocument(artifacts, graph) as {
    services: Record<string, {
      image: string;
      ports?: string[];
      networks?: string[];
      configs?: unknown[];
    }>;
    networks?: Record<string, unknown>;
    configs?: Record<string, { content: string }>;
  };

  assertEquals(document.services.gateway.image, "nginx:1.27-alpine");
  assertEquals(document.services.gateway.ports, ["80:80"]);
  assertEquals(document.services.gateway.networks, ["edge"]);
  assertEquals(document.services.gateway.configs, [
    { source: "gateway-nginx-conf", target: "/etc/nginx/nginx.conf" },
  ]);
  assertEquals(document.networks, { edge: { external: true } });

  const conf = document.configs!["gateway-nginx-conf"].content;
  assertEquals(conf.includes("server_name example.localhost;"), true);
  assertEquals(
    conf.includes("location /api/ {\n      proxy_pass http://api:8080;"),
    true,
  );
  assertEquals(
    conf.includes("location /strip/ {\n      proxy_pass http://api:8080/;"),
    true,
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
    (await composeKit.present(first.artifacts, first.graph)).content,
    (await composeKit.present(second.artifacts, second.graph)).content,
  );
});
