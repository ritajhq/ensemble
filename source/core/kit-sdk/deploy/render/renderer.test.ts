import { assertEquals, assertNotStrictEquals, assertThrows } from "@std/assert";
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

function fakeRelationalProvision(request: ResolvedRequest): ProvisionOutcome {
  const secretVar = String(request.params.passwordSecret).toUpperCase().replace(
    /-/g,
    "_",
  );
  return {
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
  };
}

function fakeComputeProvision(request: ResolvedRequest): ProvisionOutcome {
  return {
    fragment: {
      category: request.category,
      name: request.name,
      content: { image: request.params.image, environment: request.params.env },
    },
    outputs: {},
  };
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
      provisioner: { matches: () => true, provision: fakeRelationalProvision },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
  ]);

  const releaseLocator = new StubReleaseLocator({
    development: { web: { kind: "image", ref: "ens-local/web:dev" } },
    production: { web: { kind: "image", ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const referenceResolver = new ReferenceResolver(new FakeRealization()); // FakeRealization: everything is "static"
  const renderer = new Renderer(referenceResolver, releaseLocator, registry);

  return { renderer, workload, requests, selections, graph };
}

Deno.test("Renderer.render: bakes a static database output into the compute's env, in dependency order", () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const artifacts = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "production",
  );

  const api = artifacts.fragments.find((f) => f.name === "api")!;
  assertEquals(
    (api.content as { environment: Record<string, unknown> }).environment
      .DATABASE_URL,
    "postgres://appuser:${DB_PASSWORD}@primary:5432/appdb",
  );
});

Deno.test("Renderer.render: bakes the release sugar into the compute's image, per mode", () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const production = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "production",
  );
  const development = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "development",
  );

  const image = (fragments: typeof production.fragments) =>
    (fragments.find((f) => f.name === "api")!.content as { image: unknown })
      .image;
  assertEquals(image(production.fragments), "registry.ritaj.app/web:1.4.2");
  assertEquals(image(development.fragments), "ens-local/web:dev");
});

Deno.test("Renderer.render: fragments appear in dependency order (database before compute)", () => {
  const { renderer, workload, requests, selections, graph } = buildPipeline(
    APPENDIX_A,
  );

  const artifacts = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "production",
  );
  assertEquals(artifacts.fragments.map((f) => f.name), ["primary", "api"]);
});

Deno.test("Renderer.render: throws when a resource has no matching provisioning request/selection", () => {
  const { renderer, workload, selections, graph } = buildPipeline(APPENDIX_A);
  const emptyRequests = new Map<string, ProvisioningRequest>();

  assertThrows(
    () =>
      renderer.render(workload, emptyRequests, selections, graph, "production"),
    RendererError,
  );
});

Deno.test("Renderer.render: throws when the selected provisioner has no provision() body", () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const selectionsWithoutProvision = new Map<string, SelectedProvisioner>([
    ["databases.primary", { provisioner: { matches: () => true }, gaps: [] }],
    ["compute.api", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
  ]);

  assertThrows(
    () =>
      renderer.render(
        workload,
        requests,
        selectionsWithoutProvision,
        graph,
        "production",
      ),
    RendererError,
  );
});

Deno.test("Renderer.render: a dynamic output's native wiring passes through to the referencing fragment untouched — never a guessed concrete value (G3, honest plan output)", () => {
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
  ): ProvisionOutcome {
    return {
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: {
        host: dynamicWiring,
        port: 5432,
        user: request.params.user,
        database: request.params.database,
        url: dynamicWiring,
      },
    };
  }

  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => true,
        provision: awsLikeRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
  ]);

  class AllDynamicRealization extends FakeRealization {
    override knowabilityOf(): Knowability {
      return "dynamic";
    }
  }

  const releaseLocator = new StubReleaseLocator({
    development: { web: { kind: "image", ref: "ens-local/web:dev" } },
    production: { web: { kind: "image", ref: "registry.ritaj.app/web:1.4.2" } },
  });
  const renderer = new Renderer(
    new ReferenceResolver(new AllDynamicRealization()),
    releaseLocator,
    registry,
  );

  const artifacts = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "production",
  );
  const api = artifacts.fragments.find((f) => f.name === "api")!;

  assertEquals(
    (api.content as { environment: Record<string, unknown> }).environment
      .DATABASE_URL,
    dynamicWiring,
  );
});

Deno.test("Renderer.render: throws when a provisioner produces fewer outputs than its contract declares (Section 6 portability)", () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const incompleteRelationalProvision: typeof fakeRelationalProvision = (
    request,
  ) => ({
    fragment: { category: request.category, name: request.name, content: {} },
    outputs: { host: request.name, url: "u" }, // missing port/user/database
  });
  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: {
        matches: () => true,
        provision: incompleteRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
  ]);

  const error = assertThrows(
    () => renderer.render(workload, requests, selections, graph, "production"),
    RendererError,
  );
  assertEquals(
    error.message,
    'databases.relational\'s provisioner produced the wrong outputs for "databases.primary" (missing: port, user, database).',
  );
});

Deno.test("Renderer.render: throws when a provisioner produces an output its contract doesn't declare", () => {
  const { renderer, workload, requests, graph } = buildPipeline(APPENDIX_A);
  const overproducingComputeProvision: typeof fakeComputeProvision = (
    request,
  ) => ({
    fragment: { category: request.category, name: request.name, content: {} },
    outputs: { url: "not declared by container-orchestrated.v1" },
  });
  const selections = new Map<string, SelectedProvisioner>([
    ["databases.primary", {
      provisioner: { matches: () => true, provision: fakeRelationalProvision },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: {
        matches: () => true,
        provision: overproducingComputeProvision,
      },
      gaps: [],
    }],
  ]);

  const error = assertThrows(
    () => renderer.render(workload, requests, selections, graph, "production"),
    RendererError,
  );
  assertEquals(
    error.message,
    'compute.container-orchestrated\'s provisioner produced the wrong outputs for "compute.api" (extra: url).',
  );
});

Deno.test("Renderer.render: two consumers of the same dynamic output each get their own object, never a shared reference", () => {
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
  ): ProvisionOutcome {
    return {
      fragment: { category: request.category, name: request.name, content: {} },
      outputs: {
        host: dynamicUrl,
        port: 5432,
        user: request.params.user,
        database: request.params.database,
        url: dynamicUrl,
      },
    };
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
        matches: () => true,
        provision: dynamicRelationalProvision,
      },
      gaps: [],
    }],
    ["compute.api", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
    ["compute.worker", {
      provisioner: { matches: () => true, provision: fakeComputeProvision },
      gaps: [],
    }],
  ]);

  class AllDynamicRealization extends FakeRealization {
    override knowabilityOf(): Knowability {
      return "dynamic";
    }
  }
  const releaseLocator = new StubReleaseLocator({
    development: {},
    production: {},
  });
  const renderer = new Renderer(
    new ReferenceResolver(new AllDynamicRealization()),
    releaseLocator,
    registry,
  );

  const artifacts = renderer.render(
    workload,
    requests,
    selections,
    graph,
    "production",
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
