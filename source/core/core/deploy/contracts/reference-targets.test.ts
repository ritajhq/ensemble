import { assertEquals } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import { ReferenceSyntax } from "../reference.ts";
import { ContractCatalog } from "./registry.ts";
import { ReferenceTargets } from "./reference-targets.ts";
import { ReferenceValidator } from "./reference-validator.ts";
import { SEEDED } from "./seeds/index.ts";

const MANIFEST = `
version: v1
release:
  web:
    kit: docker
deploy:
  compute:
    api:
      type: container-orchestrated
      image: \${release.web}
      replicas: 1
      ports:
        http: 8080
  databases:
    db:
      type: relational
  variables:
    region: {}
  external:
    edge:
      type: network
      name: edge
  storage:
    mystery:
      type: not-seeded
`;

const catalog = new ContractCatalog(SEEDED);
const syntax = new ReferenceSyntax();

function formatted(targets: { reference: Parameters<ReferenceSyntax["format"]>[0] }[]): string[] {
  return targets.map(({ reference }) => syntax.format(reference));
}

Deno.test("ReferenceTargets: lists releases, contract outputs, ports and declaration fields", () => {
  const workload = new Parser().parse(MANIFEST);
  const targets = formatted(new ReferenceTargets(catalog).ofWorkload(workload));

  for (
    const expected of [
      "${release.web}",
      "${compute.api.http}",
      "${databases.db.host}",
      "${variables.region.value}",
      "${external.edge.name}",
    ]
  ) {
    assertEquals(targets.includes(expected), true, `missing ${expected} in ${targets.join(", ")}`);
  }
  assertEquals(targets.some((t) => t.startsWith("${storage.mystery")), false);
});

Deno.test("ReferenceTargets: every listed target passes ReferenceValidator", () => {
  const workload = new Parser().parse(MANIFEST);
  const validator = new ReferenceValidator(catalog);

  for (const { reference } of new ReferenceTargets(catalog).ofWorkload(workload)) {
    const probe = {
      ...workload,
      storage: undefined,
      compute: {
        ...workload.compute,
        probe: { type: "container-orchestrated", params: { image: syntax.format(reference), replicas: 1 } },
      },
    };
    validator.validate(probe);
  }
});

Deno.test("ReferenceTargets: deployment targets are listed separately", () => {
  assertEquals(formatted(new ReferenceTargets(catalog).ofDeployment()), [
    "${deployment.name}",
    "${deployment.artifact}",
    "${deployment.root}",
  ]);
});

Deno.test("ReferenceSyntax: format is the inverse of parse", () => {
  for (const raw of ["${databases.db.host}", "${release.web}"]) {
    assertEquals(syntax.format(syntax.parse(raw)!), raw);
  }
});
