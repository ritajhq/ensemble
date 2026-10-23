import { assertEquals, assertThrows } from "@std/assert";
import { Deploy } from "@ensemble/core";
import { Mapper } from "./mapper.ts";

const parse = (text: string) => new Deploy.Manifest.Parser().parse(text);
const mapper = new Mapper();

const MANIFEST = `
version: v1
release:
  api:
    kit: docker
deploy:
  compute:
    api:
      type: container
      image: \${release.api}
      replicas: 2
      env:
        REGION: \${variables.region.value}
      envSecrets:
        DB_PASSWORD: db-password
      networks:
        - \${external.edge.name}
  databases:
    main:
      type: relational
      engine: postgres
      passwordSecret: db-password
  secrets:
    db-password:
      source: environment
      description: Admin login
  variables:
    region:
      default: us-east-1
  external:
    edge:
      type: network
      name: edge
`;

Deno.test("map: an entry for every piece of the deploy block, none for a release", () => {
  const { entries } = mapper.map(parse(MANIFEST));
  assertEquals(entries.map((entry) => entry.id).sort(), [
    "compute.api",
    "databases.main",
    "external.edge",
    "secrets.db-password",
    "variables.region",
  ]);
});

Deno.test("map: icons follow the resource's type, and secrets, variables and externals have their own", () => {
  const icons = Object.fromEntries(
    mapper.map(parse(MANIFEST)).entries.map((entry) => [entry.id, entry.icon]),
  );
  assertEquals(icons, {
    "compute.api": "compute-container",
    "databases.main": "database-relational",
    "secrets.db-password": "secret",
    "variables.region": "variable",
    "external.edge": "external",
  });
});

Deno.test("map: a type with no icon falls back to unknown", () => {
  const { entries } = mapper.map(parse(`
version: v1
deploy:
  messaging:
    jobs:
      type: queue
`));
  assertEquals(entries[0].icon, "unknown");
});

Deno.test("map: relations name the entry used and the field using it", () => {
  const { relations } = mapper.map(parse(MANIFEST));
  assertEquals(
    relations.map((r) => `${r.from} -> ${r.to} (${r.via})`).sort(),
    [
      "compute.api -> external.edge (networks.0)",
      "compute.api -> release.api (image)",
      "compute.api -> secrets.db-password (envSecrets.DB_PASSWORD)",
      "compute.api -> variables.region (env.REGION)",
      "databases.main -> secrets.db-password (passwordSecret)",
    ],
  );
});

Deno.test("map: one field using an entry twice relates it once", () => {
  const { relations } = mapper.map(parse(`
version: v1
deploy:
  compute:
    api:
      type: container
      env:
        URL: http://\${variables.host.value}:\${variables.host.value}
  variables:
    host: {}
`));
  assertEquals(relations.length, 1);
});

Deno.test("map: layers put what is used above what uses it", () => {
  const layers = Object.fromEntries(
    mapper.map(parse(MANIFEST)).entries.map((entry) => [entry.id, entry.layer]),
  );
  assertEquals(layers, {
    "compute.api": 1,
    "databases.main": 1,
    "secrets.db-password": 0,
    "variables.region": 0,
    "external.edge": 0,
  });
});

Deno.test("map: secrets and variables carry their description, variables their default", () => {
  const byId = Object.fromEntries(
    mapper.map(parse(MANIFEST)).entries.map((entry) => [entry.id, entry]),
  );
  assertEquals(byId["secrets.db-password"].description, "Admin login");
  assertEquals(byId["variables.region"].details, [
    { label: "default", value: "us-east-1" },
  ]);
});

Deno.test("map: a reference to an undeclared entry is rejected", () => {
  assertThrows(
    () =>
      mapper.map(parse(`
version: v1
deploy:
  compute:
    api:
      type: container
      env:
        REGION: \${variables.region.value}
`)),
    Deploy.Resolve.DependencyGraphError,
  );
});

Deno.test("map: a value that is one whole reference is shown as its name alone", () => {
  const { entries } = mapper.map(parse(`
version: v1
release:
  api:
    kit: docker
deploy:
  compute:
    api:
      type: container
      image: \${release.api}
`));
  assertEquals(entries[0].details, [{ label: "image", value: "release.api" }]);
});
