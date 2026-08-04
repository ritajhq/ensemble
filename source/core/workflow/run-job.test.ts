import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { runJob } from "./run-job.ts";
import { buildRootContext } from "./context.ts";
import { JobLogger } from "./logging.ts";
import type { Job } from "./schema.ts";

const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
const cwd = workflowDir;
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
  const outcome = await runJob(job, root, workflowDir, cwd, silentLogger("test"));
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
  const outcome = await runJob(job, root, workflowDir, cwd, silentLogger("test"));
  assertEquals(outcome.result, "success");
});

Deno.test("runJob: failing step fails the job and skips remaining steps", async () => {
  const job: Job = {
    steps: [
      { script: "./failing-script.ts" },
      { id: "never", script: "./succeeding-script.ts" },
    ],
  };
  const outcome = await runJob(job, root, workflowDir, cwd, silentLogger("test"));
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
  const outcome = await runJob(job, root, workflowDir, cwd, silentLogger("test"));
  assertEquals(outcome.result, "success");
  assertEquals(outcome.outputs, { ok: "true" });
});

Deno.test("runJob: job-level if: false skips the whole job", async () => {
  const job: Job = {
    if: "false",
    steps: [{ script: "./failing-script.ts" }],
  };
  const outcome = await runJob(job, root, workflowDir, cwd, silentLogger("test"));
  assertEquals(outcome.result, "skipped");
});

Deno.test("runJob: job-level if: referencing needs.<job>.result", async () => {
  const rootWithNeeds = buildRootContext({}, { build: { result: "success", outputs: {} } });
  const job: Job = {
    if: "${{ needs.build.result == 'success' }}",
    steps: [{ run: "echo deploying" }],
  };
  const outcome = await runJob(job, rootWithNeeds, workflowDir, cwd, silentLogger("deploy"));
  assertEquals(outcome.result, "success");
});

Deno.test("runJob: step start/end markers use name, falling back to step type", async () => {
  const job: Job = {
    steps: [
      { name: "Say hi", run: "echo hi" },
      { script: "./succeeding-script.ts" },
    ],
  };
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    await runJob(job, root, workflowDir, cwd, silentLogger("test"));
  } finally {
    console.log = originalLog;
  }
  assertEquals(lines.includes("--- step:test/Say hi started ---"), true);
  assertEquals(lines.some((l) => l.startsWith("--- step:test/Say hi success")), true);
  assertEquals(lines.includes("--- step:test/script started ---"), true);
  assertEquals(lines.some((l) => l.startsWith("--- step:test/script success")), true);
});

Deno.test("runJob: step name: interpolates ${{ variables.* }}", async () => {
  const rootWithVars = buildRootContext({ ENV_NAME: "staging" }, {});
  const job: Job = {
    steps: [{ name: "Deploy to ${{ variables.ENV_NAME }}", run: "echo hi" }],
  };
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    await runJob(job, rootWithVars, workflowDir, cwd, silentLogger("test"));
  } finally {
    console.log = originalLog;
  }
  assertEquals(lines.includes("--- step:test/Deploy to staging started ---"), true);
});
