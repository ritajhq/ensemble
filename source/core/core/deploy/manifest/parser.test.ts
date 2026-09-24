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

Deno.test("parse: a variable's only field is its default", () => {
  const workload = parser.parse(`
version: v1
deploy:
  variables:
    region: { default: us-east-1 }
`);
  assertEquals(workload.variables?.region, { default: "us-east-1" });
});

Deno.test("parse: a variable needs no default at all", () => {
  const workload = parser.parse(`
version: v1
deploy:
  variables:
    repos: {}
`);
  assertEquals(workload.variables?.repos, { default: undefined });
});

Deno.test("parse: rejects an unknown variable key", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  variables:
    region: { defualt: us-east-1 }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.deploy.variables.region has an unknown key "defualt". Did you mean "default"?',
  );
});

Deno.test("parse: rejects a non-mapping manifest", () => {
  const error = assertThrows(
    () => parser.parse(`- just\n- a\n- list`),
    ManifestError,
  );
  assertEquals(error.message, "manifest must be a mapping.");
});

Deno.test("parse: tasks keep their run/script and arguments", () => {
  const workload = parser.parse(`
version: v1
tasks:
  migrate:
    script: migrate.sh
    arguments:
      project: \${deployment.name}
      attempts: 3
      verbose: true
  greet:
    run: echo hello
`);

  assertEquals(workload.tasks, {
    migrate: {
      run: undefined,
      script: "migrate.sh",
      arguments: { project: "${deployment.name}", attempts: 3, verbose: true },
    },
    greet: { run: "echo hello", script: undefined, arguments: undefined },
  });
});

Deno.test("parse: a task declares exactly one of run and script", () => {
  const missing = assertThrows(
    () => parser.parse(`version: v1\ntasks:\n  t:\n    arguments: {}`),
    ManifestError,
  );
  assertEquals(
    missing.message,
    'manifest.tasks.t must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/scripts/).',
  );

  const both = assertThrows(
    () =>
      parser.parse(
        `version: v1\ntasks:\n  t:\n    run: echo hi\n    script: t.sh`,
      ),
    ManifestError,
  );
  assertEquals(
    both.message,
    'manifest.tasks.t must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/scripts/).',
  );
});

Deno.test("parse: a task's run must be a non-empty string", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\ntasks:\n  t:\n    run: ""`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.tasks.t.run must be a non-empty string.",
  );
});

Deno.test("parse: a task's script must stay inside the workload's own scripts/ folder", () => {
  const absolute = assertThrows(
    () => parser.parse(`version: v1\ntasks:\n  t:\n    script: /etc/passwd`),
    ManifestError,
  );
  assertEquals(
    absolute.message,
    'manifest.tasks.t.script must be a path inside the workload\'s own scripts/ folder (got "/etc/passwd").',
  );

  const traversing = assertThrows(
    () => parser.parse(`version: v1\ntasks:\n  t:\n    script: ../../x.sh`),
    ManifestError,
  );
  assertEquals(
    traversing.message,
    'manifest.tasks.t.script must be a path inside the workload\'s own scripts/ folder (got "../../x.sh").',
  );
});

Deno.test("parse: a task argument name has to be shell-safe, because it becomes an environment variable", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\ntasks:\n  t:\n    run: x\n    arguments:\n      web-port: 1`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.tasks.t.arguments.web-port: an argument name becomes an environment variable for the task, so it must be a shell-safe identifier (/^[A-Za-z_][A-Za-z0-9_]*$/) — a dash, say, would make "$web-port" read as a different variable in a shell.',
  );
});

Deno.test("parse: a task argument must be a single value", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\ntasks:\n  t:\n    run: x\n    arguments:\n      files: [a, b]`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.tasks.t.arguments.files must be a string, number, or boolean (or a ${...} reference to one).",
  );
});

Deno.test("parse: a task rejects an unknown key with a near-miss suggestion", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\ntasks:\n  t:\n    run: x\n    scrip: t.sh`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.tasks.t has an unknown key "scrip". Did you mean "script"?',
  );
});

Deno.test("parse: tasks must be a mapping", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\ntasks: not-a-mapping`),
    ManifestError,
  );
  assertEquals(error.message, "manifest.tasks must be a mapping.");
});
