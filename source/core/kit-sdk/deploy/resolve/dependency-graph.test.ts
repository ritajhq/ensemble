import { assertEquals, assertThrows } from "@std/assert";
import { Parser } from "../manifest/parser.ts";
import {
  DependencyGraphBuilder,
  DependencyGraphError,
} from "./dependency-graph.ts";

const parser = new Parser();
const builder = new DependencyGraphBuilder();

Deno.test("DependencyGraphBuilder.build: orders Appendix A into release, then database, then compute", () => {
  const workload = parser.parse(`
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
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
`);

  const graph = builder.build(workload);
  assertEquals(graph.batches(), [
    [{ category: "databases", name: "primary" }, {
      category: "release",
      name: "web",
    }],
    [{ category: "compute", name: "api" }],
  ]);
});

Deno.test("DependencyGraphBuilder.build: independent resources land in the same batch", () => {
  const workload = parser.parse(`
version: v1
deploy:
  databases:
    primary: { type: relational, engine: postgres, version: "16", user: a, database: b, passwordSecret: s }
    replica: { type: relational, engine: postgres, version: "16", user: a, database: b, passwordSecret: s }
`);

  const graph = builder.build(workload);
  assertEquals(graph.batches(), [
    [{ category: "databases", name: "primary" }, {
      category: "databases",
      name: "replica",
    }],
  ]);
});

Deno.test("DependencyGraphBuilder.build: throws on a reference to an undeclared resource", () => {
  const workload = parser.parse(`
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      image: nginx
      replicas: 1
      env: { DATABASE_URL: "\${databases.primary.url}" }
`);

  const error = assertThrows(
    () => builder.build(workload),
    DependencyGraphError,
  );
  assertEquals(
    error.message,
    'compute.api references undeclared resource "databases.primary".',
  );
});

Deno.test("DependencyGraphBuilder.build: dependenciesOf reports a resource's direct references", () => {
  const workload = parser.parse(`
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
      engine: postgres
      version: "16"
      user: appuser
      database: appdb
      passwordSecret: db-password
`);

  const graph = builder.build(workload);
  assertEquals(
    [...graph.dependenciesOf({ category: "compute", name: "api" })].sort((
      a,
      b,
    ) => a.name.localeCompare(b.name)),
    [{ category: "databases", name: "primary" }, {
      category: "release",
      name: "web",
    }],
  );
  assertEquals(
    graph.dependenciesOf({ category: "databases", name: "primary" }),
    [],
  );
});

Deno.test("DependencyGraphBuilder.build: finds a reference inside an array-valued param (e.g. networks)", () => {
  const workload = parser.parse(`
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
`);

  const graph = builder.build(workload);
  assertEquals(
    graph.dependenciesOf({ category: "compute", name: "api" }),
    [{ category: "external", name: "edge-net" }],
  );
});

Deno.test("DependencyGraphBuilder.build: throws on a cycle", () => {
  const workload = parser.parse(`
version: v1
deploy:
  networking:
    a: { type: link, target: "\${networking.b.host}" }
    b: { type: link, target: "\${networking.a.host}" }
`);

  const error = assertThrows(
    () => builder.build(workload),
    DependencyGraphError,
  );
  assertEquals(
    error.message,
    "Cycle detected among: networking.a, networking.b.",
  );
});
