import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runJob } from "./run-job.ts";
import { buildRootContext } from "./context.ts";
import { JobLogger } from "./logging.ts";
import type { Job } from "./schema.ts";

const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
const root = buildRootContext({}, {});

function silentLogger(jobId: string): JobLogger {
  const logger = new JobLogger(jobId);
  return logger;
}

Deno.test("runJob: accumulates step outputs into job outputs", async () => {
  const job: Job = {
    steps: [
      { id: "a", script: "./succeeding-script.ts" },
      { run: "echo hi" },
    ],
  };
  const outcome = await runJob(job, root, workflowDir, silentLogger("test"));
  assertEquals(outcome.result, "success");
  assertEquals(outcome.outputs, { ok: "true" });
});

Deno.test("runJob: later step sees earlier step's outputs via steps.<id>.outputs", async () => {
  const job: Job = {
    steps: [
      { id: "a", script: "./succeeding-script.ts" },
      { run: "exit 1", if: "${{ steps.a.outputs.ok != 'true' }}" },
    ],
  };
  const outcome = await runJob(job, root, workflowDir, silentLogger("test"));
  assertEquals(outcome.result, "success");
});

Deno.test("runJob: failing step fails the job and skips remaining steps", async () => {
  const job: Job = {
    steps: [
      { script: "./failing-script.ts" },
      { id: "never", script: "./succeeding-script.ts" },
    ],
  };
  const outcome = await runJob(job, root, workflowDir, silentLogger("test"));
  assertEquals(outcome.result, "failure");
  assertEquals(outcome.outputs, {});
});

Deno.test("runJob: continue-on-error step failure doesn't fail the job", async () => {
  const job: Job = {
    steps: [
      { script: "./failing-script.ts", "continue-on-error": true },
      { id: "after", script: "./succeeding-script.ts" },
    ],
  };
  const outcome = await runJob(job, root, workflowDir, silentLogger("test"));
  assertEquals(outcome.result, "success");
  assertEquals(outcome.outputs, { ok: "true" });
});

Deno.test("runJob: job-level if: false skips the whole job", async () => {
  const job: Job = {
    if: "false",
    steps: [{ script: "./failing-script.ts" }],
  };
  const outcome = await runJob(job, root, workflowDir, silentLogger("test"));
  assertEquals(outcome.result, "skipped");
});

Deno.test("runJob: job-level if: referencing needs.<job>.result", async () => {
  const rootWithNeeds = buildRootContext({}, { build: { result: "success", outputs: {} } });
  const job: Job = {
    if: "${{ needs.build.result == 'success' }}",
    steps: [{ run: "echo deploying" }],
  };
  const outcome = await runJob(job, rootWithNeeds, workflowDir, silentLogger("deploy"));
  assertEquals(outcome.result, "success");
});
