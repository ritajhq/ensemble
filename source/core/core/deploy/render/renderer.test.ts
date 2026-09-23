import {
  assertEquals,
  assertNotStrictEquals,
  assertRejects,
} from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { DependencyGraphBuilder } from "../resolve/dependency-graph.ts";
import type { ProvisioningRequest } from "../resolve/provisioning-request.ts";
import type { SelectedProvisioner } from "../resolve/selected-provisioner.ts";
import type { ProvisionOutcome, ResolvedRequest } from "../kit/provisioner.ts";
import { StubReleaseLocator } from "../kit/release-locator.ts";
import { FakeRealization } from "../resolve/test-fakes.ts";
import type { Knowability } from "../kit/realization.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import { containerOrchestratedV1 } from "../contracts/seeds/container-orchestrated.ts";
import { ReferenceResolver } from "./reference-resolver.ts";
import { Renderer, RendererError } from "./renderer.ts";

const registry = new ContractCatalog([relationalV1, containerOrchestratedV1]);

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

function fakeRelationalProvision(
  request: ResolvedRequest,
): Promise<ProvisionOutcome> {
  const secretVar = String(request.params.passwordSecret).toUpperCase().replace(
    /-/g,
    "_",
  );
  return Promise.resolve({
    fragment: {
      category: request.category,
      name: request.name,
      content: {
        image: `postgres:${request.params.version}`,
        environment: { POSTGRES_PASSWORD: `\${${secretVar}}` },
      },
    },
    outputs: {
      host: request.name,
      port: 5432,
      user: request.params.user,
      database: request.params.database,
      url:
        `postgres://${request.params.user}:\${${secretVar}}@${request.name}:5432/${request.params.database}`,
    },
  });
}

function fakeComputeProvision(
  request: ResolvedRequest,
): Promise<ProvisionOutcome> {
  return Promise.resolve({
    fragment: {
      category: request.category,
      name: request.name,
      content: { image: request.params.image, environment: request.params.env },
    },
    outputs: {},
  });
}

function buildPipeline(manifestText: string) {
  const workload = new Parser().parse(manifestText);
  const graph = new DependencyGraphBuilder().build(workload);

  const requests = new Map<string, ProvisioningRequest>([
    [
      "databases.primary",
      {
        category: "databases",
        name: "primary",
        type: "relational",
        class: "critical",
        params: workload.databases!.primary.params,
        values: {},
      },
    ],
    [
      "compute.api",
      {
        category: "compute",
        name: "api",
        type: "container-orchestrated",
        params: workload.compute!.api.params,
        values: {},
      },
    ],
  ]);

  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  const releaseLocator = new StubReleaseLocator({
    local: { web: { ref: "ens-local/web:dev" } },
    published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const referenceResolver = new ReferenceResolver(new FakeRealization()); // FakeRealization: everything is "static"
  const renderer = new Renderer(referenceResolver, releaseLocator, registry);

  return { renderer, workload, requests, selections, graph };
}

Deno.test("Renderer.render: bakes a static database output into the compute's env, in dependency order", async () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );

  const api = artifacts.fragments.find((f) => f.name === "api")!;
  assertEquals(
    (api.content as { environment: Record<string, unknown> }).environment
      .DATABASE_URL,
    "postgres://appuser:${DB_PASSWORD}@primary:5432/appdb",
  );
});

Deno.test("Renderer.render: bakes the release sugar into the compute's image, per artifacts source", async () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const published = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  const local = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "local",
  );

  const image = (fragments: typeof published.fragments) =>
    (fragments.find((f) => f.name === "api")!.content as { image: unknown })
      .image;
  assertEquals(image(published.fragments), "registry.ritaj.app/web:1.4.2");
  assertEquals(image(local.fragments), "ens-local/web:dev");
});

Deno.test("Renderer.render: fragments appear in dependency order (database before compute)", async () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  assertEquals(artifacts.fragments.map((f) => f.name), ["primary", "api"]);
});

Deno.test("Renderer.render: throws when a resource has no matching provisioning request/selection", async () => {
  const { renderer, workload, selections, graph } = buildPipeline(APPENDIX_A);
  const emptyRequests = new Map<string, ProvisioningRequest>();

  await assertRejects(
    () =>
      renderer.render(workload, emptyRequests, selections, graph, "published"),
    RendererError,
  );
});

Deno.test("Renderer.render: throws when the selected provisioner has no provision() body", async () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const selectionsWithoutProvision = new Map<string, SelectedProvisioner>([
    [
      "databases.primary",
      { provisioner: { matches: () => Promise.resolve(true) }, gaps: [] },
    ],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  await assertRejects(
    () =>
      renderer.render(
        workload,
        requests,
        selectionsWithoutProvision,
        graph,
        "published",
      ),
    RendererError,
  );
});

Deno.test("Renderer.render: a dynamic output's native wiring passes through to the referencing fragment untouched — never a guessed concrete value (G3, honest plan output)", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const graph = new DependencyGraphBuilder().build(workload);

  const requests = new Map<string, ProvisioningRequest>([
    [
      "databases.primary",
      {
        category: "databases",
        name: "primary",
        type: "relational",
        class: "critical",
        params: workload.databases!.primary.params,
        values: {},
      },
    ],
    [
      "compute.api",
      {
        category: "compute",
        name: "api",
        type: "container-orchestrated",
        params: workload.compute!.api.params,
        values: {},
      },
    ],
  ]);

  const dynamicWiring = { "Fn::GetAtt": ["Primary", "Endpoint.Address"] };
  function awsLikeRelationalProvision(
    request: ResolvedRequest,
  ): Promise<ProvisionOutcome> {
    return Promise.resolve({
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: {
        host: dynamicWiring,
        port: 5432,
        user: request.params.user,
        database: request.params.database,
        url: dynamicWiring,
      },
    });
  }

  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: awsLikeRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  class AllDynamicRealization extends FakeRealization {
    override knowabilityOf(): Promise<Knowability> {
      return Promise.resolve("dynamic");
    }
  }

  const releaseLocator = new StubReleaseLocator({
    local: { web: { ref: "ens-local/web:dev" } },
    published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const renderer = new Renderer(
    new ReferenceResolver(new AllDynamicRealization()),
    releaseLocator,
    registry,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  const api = artifacts.fragments.find((f) => f.name === "api")!;

  assertEquals(
    (api.content as { environment: Record<string, unknown> }).environment
      .DATABASE_URL,
    dynamicWiring,
  );
});

Deno.test("Renderer.render: throws when a provisioner produces fewer outputs than its contract declares (Section 6 portability)", async () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const incompleteRelationalProvision: typeof fakeRelationalProvision = (
    request,
  ) =>
    Promise.resolve({
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: { host: request.name, url: "u" }, // missing port/user/database
    });
  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: incompleteRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  const error = await assertRejects(
    () => renderer.render(workload, requests, selections, graph, "published"),
    RendererError,
  );
  assertEquals(
    error.message,
    'databases.relational\'s provisioner produced the wrong outputs for "databases.primary" (missing: port, user, database).',
  );
});

Deno.test("Renderer.render: throws when a provisioner produces an output its contract doesn't declare", async () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const overproducingComputeProvision: typeof fakeComputeProvision = (
    request,
  ) =>
    Promise.resolve({
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: { url: "not declared by container-orchestrated.v1" },
    });
  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: overproducingComputeProvision,
      },
      gaps: [],
    }],
  ]);

  const error = await assertRejects(
    () => renderer.render(workload, requests, selections, graph, "published"),
    RendererError,
  );
  assertEquals(
    error.message,
    'compute.container-orchestrated\'s provisioner produced the wrong outputs for "compute.api" (extra: url).',
  );
});

Deno.test("Renderer.render: bakes an external reference straight off the workload, not through the ledger", async () => {
  const manifest = `
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      networks: ["\${external.edge-net.name}"]
  external:
    edge-net:
      type: network
      name: edge-net
`;
  const workload = new Parser().parse(manifest);
  const graph = new DependencyGraphBuilder().build(workload);

  const requests = new Map<string, ProvisioningRequest>([
    ["compute.api", {
      category: "compute",
      name: "api",
      type: "container-orchestrated",
      params: workload.compute!.api.params,
      values: {},
    }],
  ]);
  function echoNetworksProvision(
    request: ResolvedRequest,
  ): Promise<ProvisionOutcome> {
    return Promise.resolve({
      fragment: {
        category: request.category,
        name: request.name,
        content: { networks: request.params.networks },
      },
      outputs: {},
    });
  }
  const selections = new Map<string, SelectedProvisioner>([
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: echoNetworksProvision,
      },
      gaps: [],
    }],
  ]);

  const renderer = new Renderer(
    new ReferenceResolver(new FakeRealization()),
    new StubReleaseLocator({ local: {}, published: {} }),
    registry,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  const api = artifacts.fragments.find((f) => f.name === "api")!;
  assertEquals(
    (api.content as { networks: unknown }).networks,
    ["edge-net"],
  );
});

Deno.test("Renderer.render: bakes another compute's declared port into a consumer's env — the reference surface container-orchestrated.v1's own contract comment documents (${compute.<name>.<port-name>})", async () => {
  const manifest = `
version: v1
deploy:
  compute:
    auth:
      type: container-orchestrated
      image: nginx
      replicas: 1
      ports:
        http: 4100
    admin-server:
      type: container-orchestrated
      image: nginx
      replicas: 1
      env:
        AUTH_RPC_ENDPOINT: "\${compute.auth.http}"
`;
  const workload = new Parser().parse(manifest);
  const graph = new DependencyGraphBuilder().build(workload);

  const requests = new Map<string, ProvisioningRequest>([
    ["compute.auth", {
      category: "compute",
      name: "auth",
      type: "container-orchestrated",
      params: workload.compute!.auth.params,
      values: {},
    }],
    ["compute.admin-server", {
      category: "compute",
      name: "admin-server",
      type: "container-orchestrated",
      params: workload.compute!["admin-server"].params,
      values: {},
    }],
  ]);
  const selections = new Map<string, SelectedProvisioner>([
    ["compute.auth", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
    ["compute.admin-server", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  const renderer = new Renderer(
    new ReferenceResolver(new FakeRealization()),
    new StubReleaseLocator({ local: {}, published: {} }),
    registry,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  const adminServer = artifacts.fragments.find((f) =>
    f.name === "admin-server"
  )!;
  assertEquals(
    (adminServer.content as { environment: Record<string, unknown> })
      .environment.AUTH_RPC_ENDPOINT,
    4100,
  );
});

Deno.test("Renderer.render: two consumers of the same dynamic output each get their own object, never a shared reference", async () => {
  const manifest = `
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      env: { DATABASE_URL: "\${databases.primary.url}" }
    worker:
      type: container-orchestrated
      image: nginx
      replicas: 1
      env: { DATABASE_URL: "\${databases.primary.url}" }
  databases:
    primary:
      type: relational
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
`;
  const workload = new Parser().parse(manifest);
  const graph = new DependencyGraphBuilder().build(workload);

  const dynamicUrl = { "Fn::Sub": ["postgres://..."] };
  function dynamicRelationalProvision(
    request: ResolvedRequest,
  ): Promise<ProvisionOutcome> {
    return Promise.resolve({
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: {
        host: dynamicUrl,
        port: 5432,
        user: request.params.user,
        database: request.params.database,
        url: dynamicUrl,
      },
    });
  }

  const requests = new Map<string, ProvisioningRequest>([
    [
      "databases.primary",
      {
        category: "databases",
        name: "primary",
        type: "relational",
        params: workload.databases!.primary.params,
        values: {},
      },
    ],
    ["compute.api", {
      category: "compute",
      name: "api",
      type: "container-orchestrated",
      params: workload.compute!.api.params,
      values: {},
    }],
    [
      "compute.worker",
      {
        category: "compute",
        name: "worker",
        type: "container-orchestrated",
        params: workload.compute!.worker.params,
        values: {},
      },
    ],
  ]);
  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: dynamicRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
    ["compute.worker", {
      provisioner: {
        matches: () => Promise.resolve(true),
        provision: fakeComputeProvision,
      },
      gaps: [],
    }],
  ]);

  class AllDynamicRealization extends FakeRealization {
    override knowabilityOf(): Promise<Knowability> {
      return Promise.resolve("dynamic");
    }
  }
  const releaseLocator = new StubReleaseLocator({
    local: {},
    published: {},
  });
  const renderer = new Renderer(
    new ReferenceResolver(new AllDynamicRealization()),
    releaseLocator,
    registry,
  );

  const artifacts = await renderer.render(
    workload,
    requests,
    selections,
    graph,
    "published",
  );
  const apiValue =
    (artifacts.fragments.find((f) => f.name === "api")!.content as {
      environment: Record<string, unknown>;
    })
      .environment.DATABASE_URL;
  const workerValue =
    (artifacts.fragments.find((f) => f.name === "worker")!.content as {
      environment: Record<string, unknown>;
    })
      .environment.DATABASE_URL;

  assertEquals(apiValue, workerValue);
  assertNotStrictEquals(apiValue, workerValue);
});
