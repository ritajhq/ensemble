import { assertEquals, assertThrows } from "@std/assert";
import { ManifestError } from "./errors.ts";
import { Parser } from "./parser.ts";

const parser = new Parser();

Deno.test("parse: rejects a manifest missing version", () => {
  const error = assertThrows(() => parser.parse(`deploy: {}`), ManifestError);
  assertEquals(
    error.message,
    "manifest.version is required (expected one of: v1).",
  );
});

Deno.test("parse: rejects an unsupported version", () => {
  const error = assertThrows(() => parser.parse(`version: v2`), ManifestError);
  assertEquals(
    error.message,
    'manifest.version "v2" is not supported (expected one of: v1).',
  );
});

Deno.test("parse: rejects an unknown top-level key with a near-miss suggestion", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\nrelese: {}`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest has an unknown key "relese". Did you mean "release"?',
  );
});

Deno.test("parse: rejects an unknown top-level key with no suggestion when nothing is close", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\nzzzzzzzz: {}`),
    ManifestError,
  );
  assertEquals(error.message, 'manifest has an unknown key "zzzzzzzz".');
});

Deno.test("parse: rejects an unknown deploy category", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\ndeploy:\n  compue: {}`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.deploy has an unknown key "compue". Did you mean "compute"?',
  );
});

Deno.test("parse: a minimal valid manifest round-trips to an empty Workload", () => {
  const workload = parser.parse(`version: v1`);
  assertEquals(workload, {});
});

Deno.test("parse: a typed resource requires a type", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  compute:
    api: { replicas: 2 }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.deploy.compute.api.type is required and must be a string.",
  );
});

Deno.test("parse: a typed resource keeps per-type fields as opaque params (open resource types)", () => {
  const workload = parser.parse(`
version: v1
deploy:
  compute:
    api:
      type: container-orchestrated
      class: critical
      capabilities: { ordering: true }
      image: \${release.web}
      replicas: 2
`);
  assertEquals(workload.compute?.api, {
    type: "container-orchestrated",
    class: "critical",
    capabilities: { ordering: true },
    params: { image: "${release.web}", replicas: 2 },
  });
});

Deno.test("parse: adding a brand-new type requires no parser change", () => {
  const workload = parser.parse(`
version: v1
deploy:
  compute:
    queue:
      type: some-type-invented-tomorrow
      widgets: 3
`);
  assertEquals(workload.compute?.queue.type, "some-type-invented-tomorrow");
  assertEquals(workload.compute?.queue.params, { widgets: 3 });
});

Deno.test("parse: secrets require a valid source, no type", () => {
  const workload = parser.parse(`
version: v1
deploy:
  secrets:
    db-password: { source: environment }
`);
  assertEquals(workload.secrets?.["db-password"], { source: "environment" });
});

Deno.test("parse: secrets reject an invalid source", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  secrets:
    db-password: { source: vault }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.deploy.secrets.db-password.source is required and must be "file" or "environment".',
  );
});

Deno.test("parse: secrets reject unknown keys", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  secrets:
    db-password: { source: environment, sourc: environment }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.deploy.secrets.db-password has an unknown key "sourc". Did you mean "source"?',
  );
});

Deno.test("parse: external entries require type and name, reject extras", () => {
  const workload = parser.parse(`
version: v1
deploy:
  external:
    shared-vpc: { type: vpc, name: prod-vpc }
`);
  assertEquals(workload.external?.["shared-vpc"], {
    type: "vpc",
    name: "prod-vpc",
  });

  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  external:
    shared-vpc: { type: vpc, name: prod-vpc, region: us-east-1 }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.deploy.external.shared-vpc has an unknown key "region".',
  );
});

Deno.test("parse: release entries validate kit and nested publish", () => {
  const workload = parser.parse(`
version: v1
release:
  web:
    kit: docker
    publish:
      target: push
      name: registry.example.com/web
      options: { repo: web }
`);
  assertEquals(workload.release?.web, {
    kit: "docker",
    mode: undefined,
    outputName: undefined,
    publish: {
      target: "push",
      name: "registry.example.com/web",
      options: { repo: "web" },
    },
  });
});

Deno.test("parse: release entries require kit", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\nrelease:\n  web: {}`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.release.web.kit is required and must be a string.",
  );
});

Deno.test("parse: variables are a permissive passthrough bag", () => {
  const workload = parser.parse(`
version: v1
deploy:
  variables:
    region: { default: us-east-1 }
`);
  assertEquals(workload.variables?.region, {
    params: { default: "us-east-1" },
  });
});

Deno.test("parse: rejects a non-mapping manifest", () => {
  const error = assertThrows(
    () => parser.parse(`- just\n- a\n- list`),
    ManifestError,
  );
  assertEquals(error.message, "manifest must be a mapping.");
});
