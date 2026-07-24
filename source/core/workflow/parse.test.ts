import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { parseWorkflowFile, WorkflowParseError } from "./parse.ts";

const fixturesDir = join(import.meta.dirname!, "tests", "fixtures");

async function withFixture(name: string, contents: string, fn: (path: string) => Promise<void>) {
  const path = join(fixturesDir, name);
  await Deno.writeTextFile(path, contents);
  try {
    await fn(path);
  } finally {
    await Deno.remove(path);
  }
}

Deno.test("parseWorkflowFile: valid minimal workflow", async () => {
  await withFixture(
    "valid-minimal.yml",
    `
jobs:
  build:
    steps:
      - id: compile
        run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(Object.keys(workflow.jobs), ["build"]);
      assertEquals(workflow.jobs.build.steps.length, 1);
      assertEquals(workflow.jobs.build.steps[0].id, "compile");
      assertEquals(workflow.jobs.build.steps[0].run, "echo hi");
    },
  );
});

Deno.test("parseWorkflowFile: missing jobs", async () => {
  await withFixture(
    "missing-jobs.yml",
    `
notjobs:
  build: {}
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError, "jobs");
    },
  );
});

Deno.test("parseWorkflowFile: needs referencing an unknown job", async () => {
  await withFixture(
    "unknown-needs.yml",
    `
jobs:
  test:
    needs: [build]
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'needs unknown job "build"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: duplicate step ids", async () => {
  await withFixture(
    "duplicate-step-ids.yml",
    `
jobs:
  build:
    steps:
      - id: a
        run: echo 1
      - id: a
        run: echo 2
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'duplicate step id "a"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: step with both run and script fails", async () => {
  await withFixture(
    "both-run-and-script.yml",
    `
jobs:
  build:
    steps:
      - run: echo hi
        script: ./x.ts
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError);
    },
  );
});

Deno.test("parseWorkflowFile: valid matrix parses with declared axes", async () => {
  await withFixture(
    "valid-matrix.yml",
    `
jobs:
  build:
    matrix:
      axes:
        os: [linux, mac]
        node: [18, 20]
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.matrix?.axes, { os: ["linux", "mac"], node: [18, 20] });
    },
  );
});

Deno.test("parseWorkflowFile: matrix with fail-fast and max-parallel parses", async () => {
  await withFixture(
    "matrix-with-controls.yml",
    `
jobs:
  build:
    matrix:
      axes:
        os: [linux, mac]
      fail-fast: false
      max-parallel: 2
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.matrix?.["fail-fast"], false);
      assertEquals(workflow.jobs.build.matrix?.["max-parallel"], 2);
    },
  );
});

Deno.test("parseWorkflowFile: matrix axis with empty array fails", async () => {
  await withFixture(
    "empty-matrix-axis.yml",
    `
jobs:
  build:
    matrix:
      axes:
        os: []
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'matrix axis "os" must be a non-empty list',
      );
    },
  );
});

Deno.test("parseWorkflowFile: matrix that isn't a mapping fails", async () => {
  await withFixture(
    "non-mapping-matrix.yml",
    `
jobs:
  build:
    matrix: [os]
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError);
    },
  );
});

Deno.test("parseWorkflowFile: matrix missing axes fails", async () => {
  await withFixture(
    "matrix-missing-axes.yml",
    `
jobs:
  build:
    matrix:
      fail-fast: true
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'must declare a non-empty "axes"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: matrix max-parallel that isn't a positive integer fails", async () => {
  await withFixture(
    "matrix-bad-max-parallel.yml",
    `
jobs:
  build:
    matrix:
      axes:
        os: [linux]
      max-parallel: 0
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError);
    },
  );
});

Deno.test("parseWorkflowFile: valid http trigger with payload mapping parses", async () => {
  await withFixture(
    "valid-http-trigger.yml",
    `
on:
  - http:
      payload:
        sha: commit.sha
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on, [{ http: { payload: { sha: "commit.sha" } }, github: undefined }]);
    },
  );
});

Deno.test("parseWorkflowFile: valid github trigger with tag glob parses", async () => {
  await withFixture(
    "valid-github-trigger.yml",
    `
on:
  - github:
      push:
        tags: ["v*"]
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on, [{ http: undefined, github: { push: { tags: ["v*"] } } }]);
    },
  );
});

Deno.test("parseWorkflowFile: on: with both http and github in one entry fails", async () => {
  await withFixture(
    "on-both-http-and-github.yml",
    `
on:
  - http: {}
    github:
      push:
        tags: ["v*"]
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'must have exactly one of "http" or "github"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: on: entry with neither http nor github fails", async () => {
  await withFixture(
    "on-neither.yml",
    `
on:
  - foo: bar
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'must have exactly one of "http" or "github"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: github trigger missing push.tags fails", async () => {
  await withFixture(
    "github-missing-tags.yml",
    `
on:
  - github:
      push: {}
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'must declare a non-empty "push.tags"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: http trigger with non-string payload value fails", async () => {
  await withFixture(
    "http-bad-payload.yml",
    `
on:
  - http:
      payload:
        count: 5
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "payload" that isn't a mapping of strings`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: empty on: list fails", async () => {
  await withFixture(
    "empty-on.yml",
    `
on: []
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError, '"on" must be a non-empty list');
    },
  );
});

Deno.test("parseWorkflowFile: step with neither run nor script fails", async () => {
  await withFixture(
    "neither-run-nor-script.yml",
    `
jobs:
  build:
    steps:
      - id: a
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError);
    },
  );
});
