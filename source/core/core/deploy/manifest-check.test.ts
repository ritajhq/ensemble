import { assertEquals } from "@std/assert";
import { ManifestCheck } from "./manifest-check.ts";

const check = new ManifestCheck();

Deno.test("ManifestCheck: reports structure, contract and reference problems together", () => {
  const problems = check.problemsOf(`version: v1
deploy:
  compute:
    api:
      type: container
      replica: 1
      image: \${release.web}
  databases:
    db:
      type: graph
`);

  assertEquals(problems.map((problem) => problem.path), [
    ["deploy", "compute", "api", "replica"],
    ["deploy", "compute", "api"],
    ["deploy", "databases", "db", "type"],
    ["deploy", "compute", "api", "image"],
  ]);
  assertEquals(
    problems[0].message,
    'compute.container has no param "replica". Did you mean "replicas"?',
  );
});

Deno.test("ManifestCheck: a reference cycle marks every resource in it", () => {
  const problems = check.problemsOf(`version: v1
deploy:
  storage:
    a:
      type: object-storage
      bucket: \${storage.b.bucket}
    b:
      type: object-storage
      bucket: \${storage.a.bucket}
`);

  assertEquals(problems.map((problem) => problem.path), [
    ["deploy", "storage", "a"],
    ["deploy", "storage", "b"],
  ]);
});

Deno.test("ManifestCheck: a valid manifest has no problems", () => {
  assertEquals(
    check.problemsOf(`version: v1
release:
  web:
    kit: docker
deploy:
  compute:
    web:
      type: container
      image: \${release.web}
      replicas: 1
`),
    [],
  );
});
