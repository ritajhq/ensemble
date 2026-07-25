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
