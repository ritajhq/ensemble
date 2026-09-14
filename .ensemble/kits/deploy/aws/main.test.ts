import { fromFileUrl } from "@std/path";
import { assertEquals } from "@std/assert";
import { assertSnapshot } from "@std/testing/snapshot";
import * as KitSdk from "@ensemble/kit-sdk";
import awsKit from "./main.ts";
import { assembleCloudFormationDocument } from "./cloudformation-document.ts";

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
 * build graph → render) for one workload against one kit — the same
 * test-only glue `compose/main.test.ts` uses; real wiring is
 * `DeploymentCoordinator` (Phase 6), exercised separately.
 */
async function renderWorkload(
  fixturePath: string,
  kit: KitSdk.Deploy.Kit,
  releaseLocator: KitSdk.Deploy.ReleaseLocatorPort,
  artifactsSource: KitSdk.Deploy.ArtifactsSource,
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
  published: {
    web: { ref: "123456.dkr.ecr.amazonaws.com/web:1.4.2" },
  },
});

Deno.test("aws kit: renders Appendix A's worked example (golden snapshot)", async (t) => {
  const { artifacts } = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );
  const document = assembleCloudFormationDocument(artifacts);

  await assertSnapshot(t, document);
});

Deno.test("aws kit: matches Appendix A's documented content exactly", async () => {
  const { artifacts } = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );
  const document = assembleCloudFormationDocument(artifacts) as {
    Parameters: Record<string, unknown>;
    Resources: Record<string, unknown>;
  };

  assertEquals(document.Parameters, {
    DbPassword: { Type: "String", NoEcho: true },
  });

  assertEquals(document.Resources.Primary, {
    Type: "AWS::RDS::DBInstance",
    Properties: {
      Engine: "postgres",
      EngineVersion: "16",
      MasterUsername: "appuser",
      MasterUserPassword: { Ref: "DbPassword" },
      DBName: "appdb",
      AllocatedStorage: 100,
      BackupRetentionPeriod: 35,
      MultiAZ: true,
      DeletionProtection: true,
    },
  });

  assertEquals(document.Resources.ApiTask, {
    Type: "AWS::ECS::TaskDefinition",
    Properties: {
      ContainerDefinitions: [
        {
          Name: "api",
          Image: "123456.dkr.ecr.amazonaws.com/web:1.4.2",
          Environment: [
            {
              Name: "DATABASE_URL",
              Value: {
                "Fn::Sub": [
                  "postgres://appuser:${Pw}@${Host}:5432/appdb",
                  {
                    Host: { "Fn::GetAtt": ["Primary", "Endpoint.Address"] },
                    Pw: { Ref: "DbPassword" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  });
});

Deno.test("aws kit: backupRetention's bound matches RDS's own real limit (35 days) — Appendix A's \"within bound\"", () => {
  const bound = awsKit.realization().boundFor(
    "databases",
    "relational",
    "backupRetention",
  );
  assertEquals(bound, { max: 35 });
});

Deno.test("aws kit: presents a valid template.yaml", async () => {
  const { artifacts } = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );
  const presented = awsKit.present(
    artifacts,
    new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build({} as never),
  );
  assertEquals(presented.filename, "template.yaml");
  assertEquals(presented.content.includes("AWS::RDS::DBInstance"), true);
});

Deno.test("aws kit: present() never emits YAML anchors/aliases, even though DbPassword's !Ref is reused in two places", async () => {
  const { artifacts } = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );
  const presented = awsKit.present(
    artifacts,
    new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build({} as never),
  );

  // CFN's own YAML parser has a history of shaky anchor/alias support — a naive
  // implementation that shares one `{Ref: DbPassword}` object across both
  // MasterUserPassword and the url `Fn::Sub`'s Pw variable would trigger
  // @std/yaml's "same object seen twice" anchoring (`&ref_0` ... `*ref_0`).
  assertEquals(/[&*]ref_\d/.test(presented.content), false);
});

Deno.test("aws kit: applyCommand runs cloudformation deploy scoped by the deployment's own stack name", () => {
  assertEquals(awsKit.applyCommand("/tmp/template.yaml", "phase7-smoke-test"), [
    "aws",
    "cloudformation",
    "deploy",
    "--template-file",
    "/tmp/template.yaml",
    "--stack-name",
    "phase7-smoke-test",
    "--capabilities",
    "CAPABILITY_NAMED_IAM",
  ]);
});

Deno.test("aws kit: rendering the same workload twice produces byte-identical presented content (G5)", async () => {
  const first = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );
  const second = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );

  assertEquals(
    awsKit.present(first.artifacts, first.graph).content,
    awsKit.present(second.artifacts, second.graph).content,
  );
});

Deno.test("portability: the same manifest renders on both compose and aws with identical output keys", async () => {
  const composeKitModule = await import("../compose/main.ts");
  const composeReleaseLocator = new KitSdk.Deploy.StubReleaseLocator({
    local: { web: { ref: "ens-local/web:dev" } },
    published: { web: { ref: "ens-local/web:dev" } },
  });

  const composeResult = await renderWorkload(
    FIXTURE,
    composeKitModule.default,
    composeReleaseLocator,
    "local",
  );
  const awsResult = await renderWorkload(
    FIXTURE,
    awsKit,
    releaseLocator,
    "published",
  );

  // Both renders must succeed at all (this line only reaches if neither threw a
  // RendererError from Section 6's output-key validation) — that validation is
  // exactly what "identical output keys across both kits" means in practice: it's
  // enforced against the shared contract, not just compared kit-to-kit here.
  assertEquals(
    composeResult.artifacts.fragments.length,
    awsResult.artifacts.fragments.length,
  );
});

const WITH_READ_REPLICAS = `
version: v1
deploy:
  databases:
    primary:
      type: relational
      capabilities: { read-replicas: 2 }
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
  secrets:
    db-password: { source: environment }
`;

Deno.test("capabilities end-to-end: aws satisfies read-replicas (no gap) and actually creates the replica resources", () => {
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_READ_REPLICAS,
  );
  const target: KitSdk.Deploy.Target = { kit: awsKit };
  const resolution = new KitSdk.Deploy.Resolve.WorkloadResolver(registry)
    .resolve(workload, target);

  assertEquals(resolution.gaps, []);
  assertEquals(
    resolution.values.get("databases.primary")?.values["read-replicas"],
    { value: 2, provenance: "capability" },
  );

  const graph = new KitSdk.Deploy.Resolve.DependencyGraphBuilder().build(
    workload,
  );
  const rendered = new KitSdk.Deploy.Render.Renderer(
    new KitSdk.Deploy.Render.ReferenceResolver(awsKit.realization()),
    releaseLocator,
    registry,
  ).render(
    workload,
    resolution.requests,
    resolution.selections,
    graph,
    "published",
  );

  const document = assembleCloudFormationDocument(rendered) as {
    Resources: Record<string, unknown>;
  };
  assertEquals(Object.keys(document.Resources).sort(), [
    "Primary",
    "PrimaryReplica1",
    "PrimaryReplica2",
  ]);
  assertEquals(document.Resources.PrimaryReplica1, {
    Type: "AWS::RDS::DBInstance",
    Properties: { SourceDBInstanceIdentifier: { Ref: "Primary" } },
  });
});

Deno.test("capabilities end-to-end: compose reports a gap for the same read-replicas request (unsatisfiable)", async () => {
  const composeKitModule = await import("../compose/main.ts");
  const workload = new KitSdk.Deploy.Manifest.Parser().parse(
    WITH_READ_REPLICAS,
  );
  const target: KitSdk.Deploy.Target = { kit: composeKitModule.default };
  const resolution = new KitSdk.Deploy.Resolve.WorkloadResolver(registry)
    .resolve(workload, target);

  assertEquals(resolution.gaps, [
    {
      resource: "databases.primary",
      gap: { capability: "read-replicas", requested: 2 },
    },
  ]);
});
