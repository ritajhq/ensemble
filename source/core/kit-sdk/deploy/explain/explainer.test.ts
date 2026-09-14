import { assertEquals, assertThrows } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
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
  development: { web: { kind: "image", ref: "ens-local/web:dev" } },
  production: { web: { kind: "image", ref: "registry.ritaj.app/web:1.4.2" } },
});

/** A fake kit whose realization mirrors compose's own — static outputs, a preset for `critical`, and *no* default anywhere for `storageSize` — so `flaggedDefaults` has nothing to flag and a test elsewhere can add a default to exercise the flag. */
function fakeKit(
  overrides: Partial<
    { readReplicasSupported: boolean; storageSizeDefault: number }
  > = {},
): Kit {
  return {
    provisioners: () => [
      {
        matches: (r) => r.declaration.type === "relational",
        describe: () => "relational",
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
            url:
              `postgres://${request.params.user}@${request.name}:5432/${request.params.database}`,
          },
        }),
      },
      {
        matches: (r) => r.declaration.type === "container-orchestrated",
        describe: () => "container-orchestrated",
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
    realization: () => ({
      classPreset: (category, type, className) =>
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
      defaultFor: (category, type, concern) =>
        category === "databases" && type === "relational" &&
          concern === "storageSize"
          ? overrides.storageSizeDefault
          : undefined,
      boundFor: () => undefined,
      supportsCapability: (category, type, capability) =>
        category === "databases" && type === "relational" &&
        capability === "read-replicas" &&
        (overrides.readReplicasSupported ?? false),
      knowabilityOf: () => "static",
    }),
    present: () => ({ filename: "x", content: "x" }),
    applyCommand: () => ["true"],
  };
}

function buildExplainer(kit: Kit) {
  const renderer = new Renderer(
    new ReferenceResolver(kit.realization()),
    releaseLocator,
    registry,
  );
  return new Explainer(registry, renderer);
}

Deno.test("Explainer.explain: names which provisioner matched and which didn't", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
    "databases",
    "primary",
  );

  assertEquals(explanation.contractId, "databases.relational");
  assertEquals(explanation.provisionerMatches, [
    { description: "relational", matched: true },
    { description: "container-orchestrated", matched: false },
  ]);
});

Deno.test("Explainer.explain: reports provenance for every resolved value", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
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

Deno.test("Explainer.explain: flags a value that resolved purely from a kit default", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit({ storageSizeDefault: 50 });
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
    "databases",
    "primary",
  );

  assertEquals(explanation.values.storageSize, {
    value: 50,
    provenance: "default",
  });
  assertEquals(explanation.flaggedDefaults, ["storageSize"]);
});

Deno.test("Explainer.explain: reports no flagged defaults when nothing resolved that way", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
    "databases",
    "primary",
  );

  assertEquals(explanation.flaggedDefaults, []);
});

Deno.test("Explainer.explain: reports an accepted capability gap without failing", () => {
  const workload = new Parser().parse(
    APPENDIX_A.replace(
      "class: critical",
      "class: critical\n      capabilities: { read-replicas: 2 }",
    ),
  );
  const kit = fakeKit({ readReplicasSupported: false });
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
    "databases",
    "primary",
  );

  assertEquals(explanation.capabilityGaps, [{
    capability: "read-replicas",
    requested: 2,
  }]);
});

Deno.test("Explainer.explain: reports no gap when the capability is satisfied", () => {
  const workload = new Parser().parse(
    APPENDIX_A.replace(
      "class: critical",
      "class: critical\n      capabilities: { read-replicas: 2 }",
    ),
  );
  const kit = fakeKit({ readReplicasSupported: true });
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
    "databases",
    "primary",
  );

  assertEquals(explanation.capabilityGaps, []);
});

Deno.test("Explainer.explain: reports the resource's real resolved outputs with knowability", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  const explanation = buildExplainer(kit).explain(
    workload,
    target,
    "production",
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

Deno.test("Explainer.explain: throws ResourceNotFoundError for an undeclared resource", () => {
  const workload = new Parser().parse(APPENDIX_A);
  const kit = fakeKit();
  const target: Target = { kit };

  assertThrows(
    () =>
      buildExplainer(kit).explain(
        workload,
        target,
        "production",
        "databases",
        "ghost",
      ),
    ResourceNotFoundError,
  );
});
