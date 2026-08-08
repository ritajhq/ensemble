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

Deno.test("parseWorkflowFile: step name parses", async () => {
  await withFixture(
    "valid-step-name.yml",
    `
jobs:
  build:
    steps:
      - name: Compile the project
        run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.steps[0].name, "Compile the project");
    },
  );
});

Deno.test("parseWorkflowFile: step with non-string name fails", async () => {
  await withFixture(
    "invalid-step-name.yml",
    `
jobs:
  build:
    steps:
      - name: 123
        run: echo hi
`,
    async (path) => {
      await assertRejects(() => parseWorkflowFile(path), WorkflowParseError);
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

Deno.test("parseWorkflowFile: valid manual trigger with inputs parses", async () => {
  await withFixture(
    "valid-manual-trigger.yml",
    `
on:
  - manual:
      inputs:
        - name: sha
          type: string
        - name: replicas
          type: number
          default: 1
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on, [{
        manual: {
          inputs: [
            { name: "sha", type: "string" },
            { name: "replicas", type: "number", default: 1 },
          ],
        },
        github: undefined,
      }]);
    },
  );
});

Deno.test("parseWorkflowFile: manual trigger with no inputs parses", async () => {
  await withFixture(
    "manual-trigger-no-inputs.yml",
    `
on:
  - manual: {}
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on, [{ manual: {}, github: undefined }]);
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
      assertEquals(workflow.on, [{ manual: undefined, github: { push: { tags: ["v*"] } } }]);
    },
  );
});

Deno.test("parseWorkflowFile: on: with both manual and github in one entry fails", async () => {
  await withFixture(
    "on-both-manual-and-github.yml",
    `
on:
  - manual: {}
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
        'must have exactly one of "manual" or "github"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: on: entry with neither manual nor github fails", async () => {
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
        'must have exactly one of "manual" or "github"',
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

Deno.test("parseWorkflowFile: manual trigger input with unknown type fails", async () => {
  await withFixture(
    "manual-bad-type.yml",
    `
on:
  - manual:
      inputs:
        - name: count
          type: integer
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "type" that must be one of`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: manual trigger input missing name fails", async () => {
  await withFixture(
    "manual-missing-name.yml",
    `
on:
  - manual:
      inputs:
        - type: string
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `must have a non-empty string "name"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: manual trigger input with mismatched default type fails", async () => {
  await withFixture(
    "manual-bad-default.yml",
    `
on:
  - manual:
      inputs:
        - name: replicas
          type: number
          default: "3"
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "default" that isn't a number`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: git-tags input requires a repository", async () => {
  await withFixture(
    "manual-git-tags-missing-repo.yml",
    `
on:
  - manual:
      inputs:
        - name: release_tag
          type: git-tags
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `must have a non-empty string "repository"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: git-tags input with a repository parses", async () => {
  await withFixture(
    "manual-git-tags.yml",
    `
on:
  - manual:
      inputs:
        - name: release_tag
          type: git-tags
          repository: https://github.com/ritajhq/ensemble.git
          display: "Tag to release"
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on?.[0].manual?.inputs, [{
        name: "release_tag",
        type: "git-tags",
        repository: "https://github.com/ritajhq/ensemble.git",
        display: "Tag to release",
      }]);
    },
  );
});

Deno.test("parseWorkflowFile: job input parses and defaults to a declared job", async () => {
  await withFixture(
    "manual-job-input.yml",
    `
on:
  - manual:
      inputs:
        - name: which_job
          type: job
          default: build
          display: "Job to run"
jobs:
  build:
    steps:
      - run: echo hi
  deploy:
    steps:
      - run: echo bye
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on?.[0].manual?.inputs, [{
        name: "which_job",
        type: "job",
        default: "build",
        display: "Job to run",
      }]);
    },
  );
});

Deno.test("parseWorkflowFile: job input with a default that isn't a declared job fails", async () => {
  await withFixture(
    "manual-job-input-unknown-default.yml",
    `
on:
  - manual:
      inputs:
        - name: which_job
          type: job
          default: nonexistent
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "default" that isn't a declared job`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: job input with multiple: true parses a list default", async () => {
  await withFixture(
    "manual-job-input-multiple.yml",
    `
on:
  - manual:
      inputs:
        - name: which_jobs
          type: job
          multiple: true
          default: [build, deploy]
jobs:
  build:
    steps:
      - run: echo hi
  deploy:
    steps:
      - run: echo bye
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.on?.[0].manual?.inputs, [{
        name: "which_jobs",
        type: "job",
        multiple: true,
        default: ["build", "deploy"],
      }]);
    },
  );
});

Deno.test("parseWorkflowFile: job input with multiple: true and a non-array default fails", async () => {
  await withFixture(
    "manual-job-input-multiple-bad-default.yml",
    `
on:
  - manual:
      inputs:
        - name: which_jobs
          type: job
          multiple: true
          default: build
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "default" that isn't a non-empty list of strings`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: job input with multiple: true and an unknown job in default fails", async () => {
  await withFixture(
    "manual-job-input-multiple-unknown-default.yml",
    `
on:
  - manual:
      inputs:
        - name: which_jobs
          type: job
          multiple: true
          default: [build, nonexistent]
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `has a "default" that isn't a declared job ("nonexistent")`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: manual trigger with duplicate input names fails", async () => {
  await withFixture(
    "manual-duplicate-input.yml",
    `
on:
  - manual:
      inputs:
        - name: sha
          type: string
        - name: sha
          type: string
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'duplicate input name "sha"',
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

Deno.test("parseWorkflowFile: valid variables mapping parses", async () => {
  await withFixture(
    "valid-variables.yml",
    `
variables:
  GREETING: hello
  API_URL: "https://example.com"
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.variables, { GREETING: "hello", API_URL: "https://example.com" });
    },
  );
});

Deno.test("parseWorkflowFile: variables with a non-string value fails", async () => {
  await withFixture(
    "invalid-variables.yml",
    `
variables:
  COUNT: 5
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `"variables" must be a mapping of strings`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: variable value with $(NAME) resolves from env", async () => {
  Deno.env.set("ENSEMBLE_TEST_ENV_REF", "resolved-value");
  try {
    await withFixture(
      "variables-env-ref.yml",
      `
variables:
  FROM_ENV: "$(ENSEMBLE_TEST_ENV_REF)"
jobs:
  build:
    steps:
      - run: echo hi
`,
      async (path) => {
        const workflow = await parseWorkflowFile(path);
        assertEquals(workflow.variables, { FROM_ENV: "resolved-value" });
      },
    );
  } finally {
    Deno.env.delete("ENSEMBLE_TEST_ENV_REF");
  }
});

Deno.test("parseWorkflowFile: variable value with unset $(NAME) fails", async () => {
  Deno.env.delete("ENSEMBLE_TEST_UNSET_ENV_REF");
  await withFixture(
    "variables-unset-env-ref.yml",
    `
variables:
  FROM_ENV: "$(ENSEMBLE_TEST_UNSET_ENV_REF)"
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'references unset env var "ENSEMBLE_TEST_UNSET_ENV_REF"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: valid resources.repositories parses", async () => {
  await withFixture(
    "valid-repositories.yml",
    `
resources:
  repositories:
    ensemble:
      url: https://github.com/ritajhq/ensemble.git
      ref: main
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.resources, {
        repositories: {
          ensemble: { url: "https://github.com/ritajhq/ensemble.git", ref: "main" },
        },
      });
    },
  );
});

Deno.test("parseWorkflowFile: resources.repositories entry without ref parses", async () => {
  await withFixture(
    "repositories-no-ref.yml",
    `
resources:
  repositories:
    ensemble:
      url: https://github.com/ritajhq/ensemble.git
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.resources?.repositories?.ensemble, {
        url: "https://github.com/ritajhq/ensemble.git",
        ref: undefined,
      });
    },
  );
});

Deno.test("parseWorkflowFile: resources.repositories entry missing url fails", async () => {
  await withFixture(
    "repositories-missing-url.yml",
    `
resources:
  repositories:
    ensemble:
      ref: main
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'resources.repositories.ensemble must have a non-empty string "url"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: resources.repositories empty mapping fails", async () => {
  await withFixture(
    "repositories-empty.yml",
    `
resources:
  repositories: {}
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        '"resources.repositories" must be a non-empty mapping',
      );
    },
  );
});

Deno.test("parseWorkflowFile: resources.repositories url with $(NAME) resolves from env", async () => {
  Deno.env.set("ENSEMBLE_TEST_REPO_URL", "https://github.com/ritajhq/private.git");
  try {
    await withFixture(
      "repositories-env-ref.yml",
      `
resources:
  repositories:
    private:
      url: "$(ENSEMBLE_TEST_REPO_URL)"
jobs:
  build:
    steps:
      - run: echo hi
`,
      async (path) => {
        const workflow = await parseWorkflowFile(path);
        assertEquals(workflow.resources?.repositories?.private.url, "https://github.com/ritajhq/private.git");
      },
    );
  } finally {
    Deno.env.delete("ENSEMBLE_TEST_REPO_URL");
  }
});

Deno.test("parseWorkflowFile: step with in.repository parses", async () => {
  await withFixture(
    "step-in-repository.yml",
    `
resources:
  repositories:
    ensemble:
      url: https://github.com/ritajhq/ensemble.git
jobs:
  build:
    steps:
      - run: echo hi
        in:
          repository: ensemble
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.steps[0].in, { repository: "ensemble" });
    },
  );
});

Deno.test("parseWorkflowFile: job-level in.repository parses and applies as every step's default", async () => {
  await withFixture(
    "job-in-repository.yml",
    `
resources:
  repositories:
    ensemble:
      url: https://github.com/ritajhq/ensemble.git
jobs:
  build:
    in:
      repository: ensemble
    steps:
      - run: echo one
      - run: echo two
        in:
          repository: ensemble
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.in, { repository: "ensemble" });
      assertEquals(workflow.jobs.build.steps[0].in, undefined);
      assertEquals(workflow.jobs.build.steps[1].in, { repository: "ensemble" });
    },
  );
});

Deno.test("parseWorkflowFile: job in: missing repository fails", async () => {
  await withFixture(
    "job-in-missing-repository.yml",
    `
jobs:
  build:
    in: {}
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `must have a non-empty string "repository"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: step in: missing repository fails", async () => {
  await withFixture(
    "step-in-missing-repository.yml",
    `
jobs:
  build:
    steps:
      - run: echo hi
        in: {}
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `must have a non-empty string "repository"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: valid context.variables with an inline value parses", async () => {
  await withFixture(
    "valid-context-variable-value.yml",
    `
context:
  variables:
    - name: REGION
      value: us-east-1
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.context?.variables, [{ name: "REGION", value: "us-east-1", default: undefined }]);
    },
  );
});

Deno.test("parseWorkflowFile: context.variables entry with only a default parses", async () => {
  await withFixture(
    "valid-context-variable-default.yml",
    `
context:
  variables:
    - name: IMAGE_TAG
      default: latest
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.context?.variables, [{ name: "IMAGE_TAG", value: undefined, default: "latest" }]);
    },
  );
});

Deno.test("parseWorkflowFile: context.variables entry with neither value nor default parses (loader-required)", async () => {
  await withFixture(
    "valid-context-variable-empty.yml",
    `
context:
  variables:
    - name: DB_HOST
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.context?.variables, [{ name: "DB_HOST", value: undefined, default: undefined }]);
    },
  );
});

Deno.test("parseWorkflowFile: context.variables entry with a non-string value fails", async () => {
  await withFixture(
    "invalid-context-variable-value.yml",
    `
context:
  variables:
    - name: COUNT
      value: 5
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `context.variables[0] has a non-string "value"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: context.variables value with $(NAME) resolves from env", async () => {
  Deno.env.set("ENSEMBLE_TEST_CTX_VAR_REF", "resolved-value");
  try {
    await withFixture(
      "context-variable-env-ref.yml",
      `
context:
  variables:
    - name: FROM_ENV
      value: "$(ENSEMBLE_TEST_CTX_VAR_REF)"
jobs:
  build:
    steps:
      - run: echo hi
`,
      async (path) => {
        const workflow = await parseWorkflowFile(path);
        assertEquals(workflow.context?.variables?.[0].value, "resolved-value");
      },
    );
  } finally {
    Deno.env.delete("ENSEMBLE_TEST_CTX_VAR_REF");
  }
});

Deno.test("parseWorkflowFile: context.variables with a duplicate name fails", async () => {
  await withFixture(
    "invalid-context-variables-duplicate.yml",
    `
context:
  variables:
    - name: REGION
      value: us-east-1
    - name: REGION
      value: eu-west-1
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `"context.variables" has a duplicate name "REGION"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: valid context.secrets list parses", async () => {
  await withFixture(
    "valid-context-secrets.yml",
    `
context:
  secrets:
    - name: GITHUB_WEBHOOK_SECRET
    - name: TF_VARS
      default: "{}"
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.context?.secrets, [
        { name: "GITHUB_WEBHOOK_SECRET", default: undefined },
        { name: "TF_VARS", default: "{}" },
      ]);
    },
  );
});

Deno.test("parseWorkflowFile: empty context.secrets list fails", async () => {
  await withFixture(
    "empty-context-secrets.yml",
    `
context:
  secrets: []
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        '"context.secrets" must be a non-empty list',
      );
    },
  );
});

Deno.test("parseWorkflowFile: context.secrets entry missing name fails", async () => {
  await withFixture(
    "context-secret-missing-name.yml",
    `
context:
  secrets:
    - default: x
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        `context.secrets[0] must have a non-empty string "name"`,
      );
    },
  );
});

Deno.test("parseWorkflowFile: context.secrets with a duplicate name fails", async () => {
  await withFixture(
    "context-secrets-duplicate.yml",
    `
context:
  secrets:
    - name: TOKEN
    - name: TOKEN
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'duplicate name "TOKEN"',
      );
    },
  );
});

Deno.test("parseWorkflowFile: workflow with no context: leaves it undefined", async () => {
  await withFixture(
    "no-context.yml",
    `
jobs:
  build:
    steps:
      - run: echo hi
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.context, undefined);
    },
  );
});

Deno.test("parseWorkflowFile: steps.<id> referencing an undeclared step id fails", async () => {
  await withFixture(
    "steps-ref-undeclared.yml",
    `
jobs:
  release:
    steps:
      - id: tag
        run: echo "tag=1.0" >> "$WORKFLOW_OUTPUT"
      - run: echo "\${{ steps.checkout.outputs.tag }}"
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'references "steps.checkout", which isn\'t a step id declared earlier',
      );
    },
  );
});

Deno.test("parseWorkflowFile: steps.<id> referencing a step declared later in the same job fails", async () => {
  await withFixture(
    "steps-ref-forward.yml",
    `
jobs:
  build:
    steps:
      - run: echo "\${{ steps.later.outputs.x }}"
      - id: later
        run: echo "x=1" >> "$WORKFLOW_OUTPUT"
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'references "steps.later", which isn\'t a step id declared earlier',
      );
    },
  );
});

Deno.test("parseWorkflowFile: steps.<id> referencing a step declared earlier parses fine", async () => {
  await withFixture(
    "steps-ref-valid.yml",
    `
jobs:
  build:
    steps:
      - id: first
        run: echo "x=1" >> "$WORKFLOW_OUTPUT"
      - run: echo "\${{ steps.first.outputs.x }}"
        name: "value is \${{ steps.first.outputs.x }}"
        if: \${{ steps.first.outputs.x == '1' }}
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.steps.length, 2);
    },
  );
});

Deno.test("parseWorkflowFile: a job-level if: referencing steps.<id> always fails (no step has run yet)", async () => {
  await withFixture(
    "job-if-refs-step.yml",
    `
jobs:
  build:
    if: \${{ steps.first.outputs.x == '1' }}
    steps:
      - id: first
        run: echo "x=1" >> "$WORKFLOW_OUTPUT"
`,
    async (path) => {
      await assertRejects(
        () => parseWorkflowFile(path),
        WorkflowParseError,
        'references "steps.first", which isn\'t a step id declared earlier',
      );
    },
  );
});

Deno.test("parseWorkflowFile: steps.<id> reference via a dynamic index is not statically checked", async () => {
  await withFixture(
    "steps-ref-dynamic.yml",
    `
variables:
  WHICH: first
jobs:
  build:
    steps:
      - id: first
        run: echo "x=1" >> "$WORKFLOW_OUTPUT"
      - run: echo "\${{ steps[variables.WHICH].outputs.x }}"
`,
    async (path) => {
      const workflow = await parseWorkflowFile(path);
      assertEquals(workflow.jobs.build.steps.length, 2);
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
