import { assertEquals } from "@std/assert";
import { RunStore } from "./runs.ts";

async function withRunStore(fn: (store: RunStore) => Promise<void>): Promise<void> {
  const kv = await Deno.openKv(":memory:");
  try {
    await fn(new RunStore(kv));
  } finally {
    kv.close();
  }
}

async function successfulRun(): Promise<{ outcomes: Record<string, never>; success: boolean }> {
  return { outcomes: {}, success: true };
}

Deno.test("RunStore: trackedRunWorkflow persists a run record readable via getRun/listRunsForWorkflow/getLatestRun", async () => {
  await withRunStore(async (store) => {
    let capturedRunId: string | undefined;
    const success = await store.trackedRunWorkflow("my-workflow", { type: "manual" }, async () => {
      const runs = await store.listRunsForWorkflow("my-workflow");
      capturedRunId = runs[0]?.runId;
      return await successfulRun();
    });

    assertEquals(success, true);
    const runs = await store.listRunsForWorkflow("my-workflow");
    assertEquals(runs.length, 1);
    assertEquals(runs[0].status, "succeeded");
    assertEquals(runs[0].trigger, { type: "manual" });

    const latest = await store.getLatestRun("my-workflow");
    assertEquals(latest?.runId, capturedRunId);

    const byId = await store.getRun(runs[0].runId, "my-workflow");
    assertEquals(byId?.status, "succeeded");
  });
});

Deno.test("RunStore: getRun scopes by workflowName — a run doesn't leak across workflow names", async () => {
  await withRunStore(async (store) => {
    await store.trackedRunWorkflow("workflow-a", undefined, successfulRun);
    const runs = await store.listRunsForWorkflow("workflow-a");
    const runId = runs[0].runId;

    assertEquals(await store.getRun(runId, "workflow-b"), undefined);
    assertEquals((await store.getRun(runId, "workflow-a"))?.runId, runId);
  });
});

Deno.test("RunStore: trackedRunWorkflow marks a run failed when the underlying run throws, and rethrows", async () => {
  await withRunStore(async (store) => {
    let thrown: unknown;
    try {
      await store.trackedRunWorkflow("my-workflow", undefined, async () => {
        throw new Error("boom");
      });
    } catch (error) {
      thrown = error;
    }

    assertEquals((thrown as Error)?.message, "boom");
    const runs = await store.listRunsForWorkflow("my-workflow");
    assertEquals(runs[0].status, "failed");
  });
});

Deno.test("RunStore: deleteRun removes the run and returns true; a second delete returns false", async () => {
  await withRunStore(async (store) => {
    await store.trackedRunWorkflow("my-workflow", undefined, successfulRun);
    const runs = await store.listRunsForWorkflow("my-workflow");
    const runId = runs[0].runId;

    assertEquals(await store.deleteRun(runId, "my-workflow"), true);
    assertEquals(await store.getRun(runId, "my-workflow"), undefined);
    assertEquals(await store.deleteRun(runId, "my-workflow"), false);
  });
});

Deno.test("RunStore: getRunSteps returns undefined for an unknown run", async () => {
  await withRunStore(async (store) => {
    assertEquals(await store.getRunSteps("nonexistent", "my-workflow"), undefined);
  });
});

Deno.test("RunStore: getStepLog returns undefined when no log was recorded for that step", async () => {
  await withRunStore(async (store) => {
    await store.trackedRunWorkflow("my-workflow", undefined, successfulRun);
    const runs = await store.listRunsForWorkflow("my-workflow");
    assertEquals(await store.getStepLog(runs[0].runId, "build", 0, "my-workflow"), undefined);
  });
});

Deno.test("RunStore: two instances against separate Deno.Kv connections don't see each other's runs", async () => {
  const kvA = await Deno.openKv(":memory:");
  const kvB = await Deno.openKv(":memory:");
  try {
    const storeA = new RunStore(kvA);
    const storeB = new RunStore(kvB);
    await storeA.trackedRunWorkflow("my-workflow", undefined, successfulRun);
    assertEquals(await storeB.listRunsForWorkflow("my-workflow"), []);
  } finally {
    kvA.close();
    kvB.close();
  }
});
