import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { runStep } from "./run-step.ts";
import type { JobContext } from "./context.ts";

const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
const cwd = workflowDir;

function emptyCtx(): JobContext {
  return { variables: {}, needs: {}, steps: {} };
}

Deno.test("runStep: run: success", async () => {
  const result = await runStep({ run: "exit 0" }, workflowDir, cwd, emptyCtx());
  assertEquals(result.result, "success");
});

Deno.test("runStep: run: failure throws", async () => {
  await assertRejects(() => runStep({ run: "exit 1" }, workflowDir, cwd, emptyCtx()));
});

Deno.test("runStep: run: with continue-on-error swallows failure", async () => {
  const result = await runStep(
    { run: "exit 1", "continue-on-error": true },
    workflowDir,
    cwd,
    emptyCtx(),
  );
  assertEquals(result.result, "failure");
  assertEquals(result.continuedOnError, true);
});

Deno.test("runStep: if: false skips the step", async () => {
  const result = await runStep(
    { run: "exit 1", if: "false" },
    workflowDir,
    cwd,
    emptyCtx(),
  );
  assertEquals(result.result, "skipped");
});

Deno.test("runStep: if: true (via context) runs the step", async () => {
  const ctx: JobContext = { variables: {}, needs: {}, steps: { a: { outputs: { ok: "true" } } } };
  const result = await runStep(
    { run: "exit 0", if: "${{ steps.a.outputs.ok == 'true' }}" },
    workflowDir,
    cwd,
    ctx,
  );
  assertEquals(result.result, "success");
});

Deno.test("runStep: script: returns outputs", async () => {
  const result = await runStep(
    { script: "./succeeding-script.ts" },
    workflowDir,
    cwd,
    emptyCtx(),
  );
  assertEquals(result.result, "success");
  assertEquals(result.outputs, { ok: "true" });
});

Deno.test("runStep: script: throwing fails the step", async () => {
  await assertRejects(() =>
    runStep({ script: "./failing-script.ts" }, workflowDir, cwd, emptyCtx())
  );
});

Deno.test("runStep: script: receives ctx.variables as plain data", async () => {
  const ctx: JobContext = { variables: { API_URL: "https://example.com" }, needs: {}, steps: {} };
  const result = await runStep({ script: "./uses-ctx-script.ts" }, workflowDir, cwd, ctx);
  assertEquals(result.outputs, { url: "https://example.com" });
});

Deno.test("runStep: run: interpolates ${{ variables.* }} before executing", async () => {
  const ctx: JobContext = { variables: { GREETING: "hello" }, needs: {}, steps: {} };
  const result = await runStep(
    { run: "test \"${{ variables.GREETING }}\" = hello" },
    workflowDir,
    cwd,
    ctx,
  );
  assertEquals(result.result, "success");
});

Deno.test("runStep: run: interpolates ${{ context.variables.*.{name,value,path} }} before executing", async () => {
  const ctx: JobContext = {
    variables: {},
    needs: {},
    steps: {},
    context: {
      variables: { TF_VARS: { name: "TF_VARS", value: "region=us-east-1", path: "/tmp/tf-vars.txt" } },
      files: {},
      secretFiles: {},
    },
  };
  const result = await runStep(
    {
      run:
        'test "${{ context.variables.TF_VARS.name }}" = TF_VARS && '
        + 'test "${{ context.variables.TF_VARS.value }}" = "region=us-east-1" && '
        + 'test "${{ context.variables.TF_VARS.path }}" = /tmp/tf-vars.txt',
    },
    workflowDir,
    cwd,
    ctx,
  );
  assertEquals(result.result, "success");
});

Deno.test("runStep: run: writes to $WORKFLOW_OUTPUT to produce outputs", async () => {
  const result = await runStep(
    { run: "echo \"tag=1.2.3\" >> \"$WORKFLOW_OUTPUT\"" },
    workflowDir,
    cwd,
    emptyCtx(),
  );
  assertEquals(result.result, "success");
  assertEquals(result.outputs, { tag: "1.2.3" });
});

Deno.test("runStep: run: with no $WORKFLOW_OUTPUT writes has empty outputs", async () => {
  const result = await runStep({ run: "exit 0" }, workflowDir, cwd, emptyCtx());
  assertEquals(result.outputs, {});
});

Deno.test("runStep: in.repository runs the step inside that repository's checkout", async () => {
  const ctx: JobContext = {
    variables: {},
    needs: {},
    steps: {},
    repositories: { demo: { path: workflowDir } },
  };
  const result = await runStep(
    { run: "pwd", in: { repository: "demo" } },
    "/some/unrelated/workflow-dir",
    "/some/unrelated/scratch-dir",
    ctx,
  );
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), workflowDir);
});

Deno.test("runStep: ensembleArtifacts() resolves relative to the step's own in.repository checkout", async () => {
  const ctx: JobContext = {
    variables: {},
    needs: {},
    steps: {},
    repositories: { demo: { path: workflowDir } },
  };
  const result = await runStep(
    { run: "echo \"${{ ensembleArtifacts('web') }}\"", in: { repository: "demo" } },
    "/some/unrelated/workflow-dir",
    "/some/unrelated/scratch-dir",
    ctx,
  );
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), join(workflowDir, "source", "artifacts", "web"));
});

Deno.test("runStep: ensembleArtifacts() with no in: resolves relative to the default cwd", async () => {
  const result = await runStep({ run: "echo \"${{ ensembleArtifacts('web') }}\"" }, workflowDir, cwd, emptyCtx());
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), join(cwd, "source", "artifacts", "web"));
});

Deno.test("runStep: in.repository referencing an undeclared repository fails", async () => {
  await assertRejects(
    () => runStep({ run: "exit 0", in: { repository: "missing" } }, workflowDir, cwd, emptyCtx()),
    Error,
    'references "missing", which isn\'t declared under resources.repositories',
  );
});

Deno.test("runStep: no in: uses the default cwd", async () => {
  const result = await runStep({ run: "pwd" }, workflowDir, cwd, emptyCtx());
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), cwd);
});

Deno.test("runStep: a step with no own in: falls back to the job's in:", async () => {
  const ctx: JobContext = {
    variables: {},
    needs: {},
    steps: {},
    repositories: { demo: { path: workflowDir } },
  };
  const result = await runStep(
    { run: "pwd" },
    "/some/unrelated/workflow-dir",
    "/some/unrelated/scratch-dir",
    ctx,
    undefined,
    { repository: "demo" },
  );
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), workflowDir);
});

Deno.test("runStep: a step's own in: overrides the job's in:", async () => {
  const otherDir = "/tmp";
  const ctx: JobContext = {
    variables: {},
    needs: {},
    steps: {},
    repositories: { demo: { path: workflowDir }, other: { path: otherDir } },
  };
  const result = await runStep(
    { run: "pwd", in: { repository: "other" } },
    "/some/unrelated/workflow-dir",
    "/some/unrelated/scratch-dir",
    ctx,
    undefined,
    { repository: "demo" },
  );
  assertEquals(result.result, "success");
  assertEquals(result.log.stdout.trim(), otherDir);
});
