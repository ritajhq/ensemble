import { assertEquals, assertRejects } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ContractError } from "../contracts/errors.ts";
import { ContractCatalog } from "../contracts/registry.ts";
import { relationalV1 } from "../contracts/seeds/relational.ts";
import { containerOrchestratedV1 } from "../contracts/seeds/container-orchestrated.ts";
import { ReferenceResolver } from "../render/reference-resolver.ts";
import { Renderer } from "../render/renderer.ts";
import { StubReleaseLocator } from "../kit/release-locator.ts";
import type { Kit } from "../kit/kit.ts";
import type { Target } from "../kit/target.ts";
import { Explainer, ResourceNotFoundError } from "./explainer.ts";

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
const releaseLocator = new StubReleaseLocator({
  local: { web: { ref: "ens-local/web:dev" } },
  published: { web: { ref: "registry.ritaj.app/web:1.4.2" } },
});

/** A fake kit whose realization mirrors compose's own — static outputs, a preset for `critical`, and *no* default anywhere for `storageSize` — so `flaggedDefaults` has nothing to flag and a test elsewhere can add a default to exercise the flag. */
function fakeKit(
  overrides: Partial<
    { readReplicasSupported: boolean; storageSizeDefault: number }
  > = {},
): Kit {
  return {
    provisioners: () =>
      Promise.resolve([
        {
          matches: (r) => Promise.resolve(r.declaration.type === "relational"),
          describe: () => Promise.resolve("relational"),
          provision: (request) =>
            Promise.resolve({
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
                url:
                  `postgres://${request.params.user}@${request.name}:5432/${request.params.database}`,
              },
            }),
        },
        {
          matches: (r) =>
            Promise.resolve(r.declaration.type === "container-orchestrated"),
          describe: () => Promise.resolve("container-orchestrated"),
          provision: (request) =>
            Promise.resolve({
              fragment: {
                category: request.category,
                name: request.name,
                content: {},
              },
              outputs: {},
            }),
        },
      ]),
    realization: () =>
      Promise.resolve({
        classPreset: (category, type, className) =>
          Promise.resolve(
            category === "databases" && type === "relational" &&
              className === "critical"
              ? {
                concernValues: {
                  backupRetention: 35,
                  multiAz: true,
                  deletionProtection: true,
                },
              }
              : undefined,
          ),
        defaultFor: (category, type, concern) =>
          Promise.resolve(
            category === "databases" && type === "relational" &&
              concern === "storageSize"
              ? overrides.storageSizeDefault
              : undefined,
          ),
        boundFor: () => Promise.resolve(undefined),
        supportsCapability: (category, type, capability) =>
          Promise.resolve(
            category === "databases" && type === "relational" &&
              capability === "read-replicas" &&
              (overrides.readReplicasSupported ?? false),
          ),
        knowabilityOf: () => Promise.resolve("static"),
      }),
    present: () => Promise.resolve({ filename: "x", content: "x" }),
    applyCommand: () => Promise.resolve(["true"]),
  };
}

async function buildExplainer(kit: Kit) {
  const renderer = new Renderer(
    new ReferenceResolver(await kit.realization()),
    releaseLocator,
    registry,
  );
  return new Explainer(registry, renderer);
}

Deno.test("Explainer.explain: names which provisioner matched and which didn't", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.contractId, "databases.relational");
  assertEquals(explanation.provisionerMatches, [
    { description: "relational", matched: true },
    { description: "container-orchestrated", matched: false },
  ]);
});

Deno.test("Explainer.explain: reports provenance for every resolved value", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.values.backupRetention, {
    value: 35,
    provenance: "preset",
  });
  assertEquals(explanation.values.multiAz, {
    value: true,
    provenance: "preset",
  });
});

Deno.test("Explainer.explain: flags a value that resolved purely from a kit default", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit({ storageSizeDefault: 50 });
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.values.storageSize, {
    value: 50,
    provenance: "default",
  });
  assertEquals(explanation.flaggedDefaults, ["storageSize"]);
});

Deno.test("Explainer.explain: reports no flagged defaults when nothing resolved that way", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.flaggedDefaults, []);
});

Deno.test("Explainer.explain: reports an accepted capability gap without failing", async () => {
  const workload = new Parser().parse(
    APPENDIX_A.replace(
      "class: critical",
      "class: critical\n      capabilities: { read-replicas: 2 }",
    ),
  );
  const kit = fakeKit({ readReplicasSupported: false });
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.capabilityGaps, [{
    capability: "read-replicas",
    requested: 2,
  }]);
});

Deno.test("Explainer.explain: reports no gap when the capability is satisfied", async () => {
  const workload = new Parser().parse(
    APPENDIX_A.replace(
      "class: critical",
      "class: critical\n      capabilities: { read-replicas: 2 }",
    ),
  );
  const kit = fakeKit({ readReplicasSupported: true });
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.capabilityGaps, []);
});

Deno.test("Explainer.explain: reports the resource's real resolved outputs with knowability", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = await (await buildExplainer(kit)).explain(
    workload,
    target,
    "published",
    "databases",
    "primary",
  );

  assertEquals(explanation.outputs.host, {
    knowability: "static",
    value: "primary",
  });
  assertEquals(explanation.outputs.url, {
    knowability: "static",
    value: "postgres://appuser@primary:5432/appdb",
  });
});

Deno.test("Explainer.explain: throws ResourceNotFoundError for an undeclared resource", async () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  await assertRejects(
    async () =>
      await (await buildExplainer(kit)).explain(
        workload,
        target,
        "published",
        "databases",
        "ghost",
      ),
    ResourceNotFoundError,
  );
});

Deno.test("Explainer.explain: throws ContractError for a reference to an undeclared output", async () => {
  const workload = new Parser().parse(
    APPENDIX_A.replace(
      "DATABASE_URL: ${databases.primary.url}",
      "DATABASE_URL: ${databases.primary.bogus}",
    ),
  );
  const kit = fakeKit();
  const target: Target = { kit };

  await assertRejects(
    async () =>
      await (await buildExplainer(kit)).explain(
        workload,
        target,
        "published",
        "databases",
        "primary",
      ),
    ContractError,
    'references undeclared output "bogus"',
  );
});
