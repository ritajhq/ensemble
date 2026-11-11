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
      type: container
      class: critical
      capabilities: { ordering: true }
      image: \${release.web}
      replicas: 2
`);
  assertEquals(workload.compute?.api, {
    type: "container",
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

Deno.test("parse: secrets and variables take an optional description", () => {
  const workload = parser.parse(`
version: v1
deploy:
  secrets:
    db-password: { source: environment, description: Admin login for the database }
  variables:
    region: { default: us-east-1, description: Where everything is deployed }
`);
  assertEquals(workload.secrets?.["db-password"], {
    source: "environment",
    description: "Admin login for the database",
  });
  assertEquals(workload.variables?.region, {
    default: "us-east-1",
    description: "Where everything is deployed",
  });
});

Deno.test("parse: a description must be a string", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  secrets:
    db-password: { source: environment, description: 3 }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.deploy.secrets.db-password.description must be a string.",
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

Deno.test("parse: a variable's default is its value's fallback", () => {
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

Deno.test("parse: operations keep their run/script and arguments", () => {
  const workload = parser.parse(`
version: v1
operations:
  migrate:
    description: Migrate the schema
    script: migrate.sh
    arguments:
      project: \${deployment.name}
      attempts: 3
      verbose: true
  greet:
    run: echo hello
`);

  assertEquals(workload.operations, {
    migrate: {
      description: "Migrate the schema",
      run: undefined,
      script: "migrate.sh",
      arguments: { project: "${deployment.name}", attempts: 3, verbose: true },
    },
    greet: {
      description: undefined,
      run: "echo hello",
      script: undefined,
      arguments: undefined,
    },
  });
});

Deno.test("parse: an operation's description must be a non-empty string", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\noperations:\n  t:\n    description: ""\n    run: echo`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.operations.t.description must be a non-empty string.",
  );
});

Deno.test("parse: an operation declares exactly one of run and script", () => {
  const missing = assertThrows(
    () => parser.parse(`version: v1\noperations:\n  t:\n    arguments: {}`),
    ManifestError,
  );
  assertEquals(
    missing.message,
    'manifest.operations.t must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/<kit>/operations/).',
  );

  const both = assertThrows(
    () =>
      parser.parse(
        `version: v1\noperations:\n  t:\n    run: echo hi\n    script: t.sh`,
      ),
    ManifestError,
  );
  assertEquals(
    both.message,
    'manifest.operations.t must declare exactly one of "run" (a shell one-liner) or "script" (a file under ci/<workload>/<kit>/operations/).',
  );
});

Deno.test("parse: an operation's run must be a non-empty string", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\noperations:\n  t:\n    run: ""`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.operations.t.run must be a non-empty string.",
  );
});

Deno.test("parse: an operation's script must stay inside the workload's own kit operations/ folder", () => {
  const absolute = assertThrows(
    () =>
      parser.parse(`version: v1\noperations:\n  t:\n    script: /etc/passwd`),
    ManifestError,
  );
  assertEquals(
    absolute.message,
    'manifest.operations.t.script must be a path inside the workload\'s own kit operations/ folder (got "/etc/passwd").',
  );

  const traversing = assertThrows(
    () =>
      parser.parse(`version: v1\noperations:\n  t:\n    script: ../../x.sh`),
    ManifestError,
  );
  assertEquals(
    traversing.message,
    'manifest.operations.t.script must be a path inside the workload\'s own kit operations/ folder (got "../../x.sh").',
  );
});

Deno.test("parse: an operation argument name has to be shell-safe, because it becomes an environment variable", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\noperations:\n  t:\n    run: x\n    arguments:\n      web-port: 1`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.operations.t.arguments.web-port: an argument name becomes an environment variable for the operation, so it must be a shell-safe identifier (/^[A-Za-z_][A-Za-z0-9_]*$/) — a dash, say, would make "$web-port" read as a different variable in a shell.',
  );
});

Deno.test("parse: an operation argument must be a single value", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\noperations:\n  t:\n    run: x\n    arguments:\n      files: [a, b]`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.operations.t.arguments.files must be a string, number, or boolean (or a ${...} reference to one).",
  );
});

Deno.test("parse: an operation rejects an unknown key with a near-miss suggestion", () => {
  const error = assertThrows(
    () =>
      parser.parse(
        `version: v1\noperations:\n  t:\n    run: x\n    scrip: t.sh`,
      ),
    ManifestError,
  );
  assertEquals(
    error.message,
    'manifest.operations.t has an unknown key "scrip". Did you mean "script"?',
  );
});

Deno.test("parse: operations must be a mapping", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\noperations: not-a-mapping`),
    ManifestError,
  );
  assertEquals(error.message, "manifest.operations must be a mapping.");
});

Deno.test("parse: a variable may be typed as a list", () => {
  const workload = parser.parse(`
version: v1
deploy:
  variables:
    networks: { type: list }
`);
  assertEquals(workload.variables?.networks, {
    type: "list",
    default: undefined,
  });
});

Deno.test("parse: rejects an unknown variable type", () => {
  const error = assertThrows(
    () =>
      parser.parse(`
version: v1
deploy:
  variables:
    networks: { type: set }
`),
    ManifestError,
  );
  assertEquals(
    error.message,
    "manifest.deploy.variables.networks.type must be one of: string, list.",
  );
});

Deno.test("parse: a launch section holds processes and desktop apps, and is not a deploy category", () => {
  const workload = parser.parse(`
version: v1
launch:
  kernel:
    type: process
    command: ["\${build.kernel}/run"]
    ports: { http: auto }
    envSecrets: { KERNEL_ACCESS_TOKEN: kernel-access-token }
    development:
      restart:
        - build: kernel
  desktop:
    type: desktop
    package: \${pack.desktop}
    env:
      ENSEMBLE_KERNEL_URL: ws://127.0.0.1:\${launch.kernel.http}
    development:
      restart:
        - pack: desktop
`);
  assertEquals(workload.launch?.kernel, {
    type: "process",
    command: ["${build.kernel}/run"],
    package: undefined,
    ports: { http: "auto" },
    env: {},
    envSecrets: { KERNEL_ACCESS_TOKEN: "kernel-access-token" },
    development: { restart: [{ build: "kernel" }] },
  });
  assertEquals(workload.launch?.desktop?.package, "${pack.desktop}");
  assertEquals(workload.launch?.desktop?.development, {
    restart: [{ pack: "desktop" }],
  });
  assertEquals(workload.compute, undefined);
});

Deno.test("parse: a launch entry needs a known type and what that type runs", () => {
  const launch = (body: string) => () =>
    parser.parse(`version: v1\nlaunch:\n  one:\n${body}`);
  assertEquals(
    assertThrows(launch("    command: [a]"), ManifestError).message,
    "manifest.launch.one.type is required (expected one of: process, desktop).",
  );
  assertEquals(
    assertThrows(launch("    type: dekstop"), ManifestError).message,
    'manifest.launch.one.type "dekstop" is not supported (expected one of: process, desktop).',
  );
  assertEquals(
    assertThrows(launch("    type: process"), ManifestError).message,
    "manifest.launch.one.command is required for a process: the program and its arguments, as a list.",
  );
  assertEquals(
    assertThrows(launch("    type: process\n    command: []"), ManifestError)
      .message,
    "manifest.launch.one.command must be a non-empty list of strings.",
  );
  assertEquals(
    assertThrows(launch("    type: desktop"), ManifestError).message,
    "manifest.launch.one.package is required for a desktop app: the pack that holds it, as ${pack.<ship>}.",
  );
  assertEquals(
    assertThrows(
      launch("    type: desktop\n    package: x\n    command: [a]"),
      ManifestError,
    ).message,
    "manifest.launch.one.command is for a process; a desktop app is started from its package.",
  );
  assertEquals(
    assertThrows(
      launch("    type: process\n    command: [a]\n    package: x"),
      ManifestError,
    ).message,
    "manifest.launch.one.package is for a desktop app; a process is started from its command.",
  );
});

Deno.test("parse: a launch entry's keys, ports, environment and restart rules are checked", () => {
  const launch = (body: string) => () =>
    parser.parse(
      `version: v1\nlaunch:\n  one:\n    type: process\n    command: [a]\n${body}`,
    );
  assertEquals(
    assertThrows(launch("    comand: x"), ManifestError).message,
    'manifest.launch.one has an unknown key "comand". Did you mean "command"?',
  );
  assertEquals(
    assertThrows(launch("    ports: { http: fast }"), ManifestError).message,
    'manifest.launch.one.ports.http must be a port number or "auto".',
  );
  assertEquals(
    assertThrows(launch("    env: { 1-bad: x }"), ManifestError).message,
    'manifest.launch.one.env has "1-bad", which is not an environment variable name.',
  );
  assertEquals(
    assertThrows(
      launch(
        "    development:\n      restart:\n        - { build: a, pack: b }",
      ),
      ManifestError,
    ).message,
    'manifest.launch.one.development.restart[0] must name exactly one of "build" or "pack".',
  );
  assertEquals(
    assertThrows(launch("    development:\n      reload: []"), ManifestError)
      .message,
    'manifest.launch.one.development has an unknown key "reload".',
  );
});

Deno.test("Parser.read: carries on past each problem, naming every one at its node", () => {
  const { workload, problems } = parser.read(`version: v2
relese: {}
release:
  web:
    knit: docker
deploy:
  compute:
    api:
      replicas: 1
  secrets:
    token:
      source: vault
`);

  assertEquals(problems.map((problem) => problem.path), [
    ["relese"],
    ["version"],
    ["release", "web", "knit"],
    ["release", "web", "kit"],
    ["deploy", "compute", "api", "type"],
    ["deploy", "secrets", "token", "source"],
  ]);
  assertEquals(
    problems[0].message,
    'manifest has an unknown key "relese". Did you mean "release"?',
  );
  assertEquals(Object.keys(workload.release ?? {}), ["web"]);
  assertEquals(Object.keys(workload.compute ?? {}), ["api"]);
});

Deno.test("Parser.parse: throws every problem at once, one per line", () => {
  const error = assertThrows(
    () => parser.parse(`version: v1\nrelese: {}\noperatons: {}`),
    ManifestError,
  );
  assertEquals(error.problems.length, 2);
  assertEquals(
    error.message,
    'manifest has an unknown key "relese". Did you mean "release"?\n' +
      'manifest has an unknown key "operatons". Did you mean "operations"?',
  );
});
