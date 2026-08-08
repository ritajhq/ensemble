import { assertEquals, assertRejects } from "@std/assert";
import { dirname, join } from "@std/path";
import { parseWorkflowFile } from "./parse.ts";
import { runWorkflow } from "./run-workflow.ts";
import { WorkflowExpressionError } from "./expressions.ts";

const examplesDir = join(import.meta.dirname!, "examples");

Deno.test("integration: hello-world runs its single job to success", async () => {
  const file = join(examplesDir, "hello-world.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });
  assertEquals(success, true);
  assertEquals(outcomes.hello.result, "success");
});

Deno.test("integration: fan-out-fan-in runs b and c after a, then d after both", async () => {
  const file = join(examplesDir, "fan-out-fan-in.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });
  assertEquals(success, true);
  for (const jobId of ["a", "b", "c", "d"]) {
    assertEquals(outcomes[jobId].result, "success");
  }
});

Deno.test("integration: failing-step demonstrates continue-on-error and downstream running", async () => {
  const file = join(examplesDir, "failing-step.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });

  assertEquals(outcomes.build.result, "success");
  assertEquals(outcomes.build.outputs.ok, "true");

  // test's script step fails but has continue-on-error: true, so the job itself succeeds.
  assertEquals(outcomes.test.result, "success");

  // deploy has needs: [build, test] and no explicit if beyond needs.test.result == 'success',
  // and both deps succeeded, so it still runs.
  assertEquals(outcomes.deploy.result, "success");

  assertEquals(success, true);
});

Deno.test("integration: --job selects only the job and its transitive deps", async () => {
  const file = join(examplesDir, "fan-out-fan-in.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes } = await runWorkflow(workflow, { workflowDir: dirname(file), job: "b" });
  assertEquals(Object.keys(outcomes).sort(), ["a", "b"]);
});

Deno.test("integration: job: [...] selects the union of each job's transitive deps", async () => {
  const file = join(examplesDir, "fan-out-fan-in.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes } = await runWorkflow(workflow, { workflowDir: dirname(file), job: ["b", "c"] });
  assertEquals(Object.keys(outcomes).sort(), ["a", "b", "c"]);
});

Deno.test("integration: an if: referencing an unknown context path fails loudly", async () => {
  const workflow = {
    jobs: {
      build: {
        steps: [{ run: "echo hi", if: "${{ nonexistent.path == 'x' }}" }],
      },
    },
  };
  await assertRejects(
    () => runWorkflow(workflow, { workflowDir: examplesDir }),
    WorkflowExpressionError,
    "Unrecognized named-value: 'nonexistent'",
  );
});

Deno.test("integration: matrix-fan-in expands, and both access patterns see all instances", async () => {
  const file = join(examplesDir, "matrix-fan-in.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });

  assertEquals(success, true);
  const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
  assertEquals(build.result, "success");
  assertEquals(build.matrix, [
    { component: "api" },
    { component: "web" },
    { component: "worker" },
  ]);
  assertEquals(build.results, ["success", "success", "success"]);
  assertEquals(build.outputs.image, [
    "myregistry/api:sha",
    "myregistry/web:sha",
    "myregistry/worker:sha",
  ]);

  assertEquals(outcomes["check-one"].result, "success");
  assertEquals(
    (outcomes.summarize.outputs as Record<string, string>).summary,
    "api=myregistry/api:sha, web=myregistry/web:sha, worker=myregistry/worker:sha",
  );
});

Deno.test("integration: matrix-partial-failure records failure at the right index", async () => {
  const file = join(examplesDir, "matrix-partial-failure.yml");
  const workflow = await parseWorkflowFile(file);
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });

  const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
  assertEquals(build.result, "failure");
  assertEquals(build.results, ["success", "success", "failure"]);
  assertEquals(build.outputs.ok, ["true", "true", undefined]);
  assertEquals(success, false);
});

Deno.test("integration: matrix arrays are indexed by generation order, not finish order", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    jobs: {
      build: {
        matrix: { axes: { index: ["0", "1", "2"] } },
        steps: [{ script: "./matrix-delay-by-index.ts" }],
      },
    },
  };
  // index "0" is the slowest (50ms), index "2" is the fastest (0ms) — if the
  // engine wrote by completion order instead of generation order, the
  // outputs/results arrays would come back scrambled.
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir });

  assertEquals(success, true);
  const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
  assertEquals(build.matrix, [{ index: "0" }, { index: "1" }, { index: "2" }]);
  assertEquals(build.results, ["success", "success", "success"]);
  assertEquals(build.outputs.seen, ["0", "1", "2"]);

  // Re-run to confirm this isn't accidentally stable — same result both times.
  const second = await runWorkflow(workflow, { workflowDir });
  const secondBuild = second.outcomes.build as import("./context.ts").MatrixNeedsResult;
  assertEquals(secondBuild.outputs.seen, ["0", "1", "2"]);
});

Deno.test("integration: fail-fast genuinely kills an in-flight sibling instance", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const markerDir = await Deno.makeTempDir();
  try {
    const workflow = {
      jobs: {
        build: {
          matrix: { axes: { index: ["0", "1"] } },
          steps: [{ script: "./fail-if-index-zero.ts" }],
        },
      },
    };
    // index 0 fails almost immediately; index 1 is a subprocess sleeping for
    // 2s. With fail-fast (default true) and both starting concurrently
    // (no max-parallel), index 1's subprocess must be genuinely killed —
    // if the run completes in well under 2s, it was actually preempted,
    // not merely left to finish on its own.
    const startedAt = performance.now();
    const { outcomes } = await runWorkflow(workflow, {
      workflowDir,
      variables: { MARKER_DIR: markerDir },
    });
    const durationMs = performance.now() - startedAt;

    const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
    assertEquals(build.results[0], "failure");
    assertEquals(build.results[1], "cancelled");
    // Real preemption: the whole run finished in well under the 2s the
    // second instance would've taken if it ran to completion unkilled.
    if (durationMs >= 1500) {
      throw new Error(`expected fail-fast to kill the sibling quickly, took ${durationMs}ms`);
    }
  } finally {
    await Deno.remove(markerDir, { recursive: true });
  }
});

Deno.test("integration: fail-fast: false lets all instances run to completion", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    jobs: {
      build: {
        matrix: { axes: { index: ["0", "1"] }, "fail-fast": false },
        steps: [{ script: "./fail-if-index-zero.ts" }],
      },
    },
  };
  const { outcomes } = await runWorkflow(workflow, { workflowDir });
  const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
  assertEquals(build.results[0], "failure");
  assertEquals(build.results[1], "success");
});

Deno.test("integration: fail-fast doesn't start not-yet-dispatched instances", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const markerDir = await Deno.makeTempDir();
  try {
    const workflow = {
      jobs: {
        build: {
          // max-parallel: 1 forces strict sequential dispatch, so instances
          // 1 and 2 are guaranteed not to have started when instance 0
          // fails — their "never started" outcome is deterministic, not a
          // race against concurrent dispatch.
          matrix: { axes: { index: ["0", "1", "2"] }, "max-parallel": 1 },
          steps: [{ script: "./mark-progress-fail-first.ts" }],
        },
      },
    };
    const { outcomes } = await runWorkflow(workflow, {
      workflowDir,
      variables: { MARKER_DIR: markerDir },
    });

    const build = outcomes.build as import("./context.ts").MatrixNeedsResult;
    assertEquals(build.results, ["failure", "cancelled", "cancelled"]);

    const started = new Set(
      [...Deno.readDirSync(markerDir)].map((entry) => entry.name.replace(".started", "")),
    );
    assertEquals(started, new Set(["0"]));
  } finally {
    await Deno.remove(markerDir, { recursive: true });
  }
});

Deno.test("integration: max-parallel caps concurrent instances", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const markerDir = await Deno.makeTempDir();
  try {
    const workflow = {
      jobs: {
        build: {
          matrix: { axes: { index: ["0", "1", "2", "3"] }, "max-parallel": 2 },
          steps: [{ script: "./track-concurrency.ts" }],
        },
      },
    };
    const { success } = await runWorkflow(workflow, {
      workflowDir,
      variables: { MARKER_DIR: markerDir },
    });
    assertEquals(success, true);

    const intervals: { start: number; end: number }[] = [];
    for (const index of ["0", "1", "2", "3"]) {
      const start = Number(await Deno.readTextFile(`${markerDir}/${index}.start`));
      const end = Number(await Deno.readTextFile(`${markerDir}/${index}.end`));
      intervals.push({ start, end });
    }

    // Compute true peak overlap from the recorded start/end timestamps —
    // an invariant check, not a timing assumption: however the scheduler
    // interleaves dispatch, at no instant should more than 2 be in flight.
    const events = intervals.flatMap((i) => [{ t: i.start, delta: 1 }, { t: i.end, delta: -1 }]);
    events.sort((a, b) => a.t - b.t);
    let concurrent = 0;
    let peak = 0;
    for (const event of events) {
      concurrent += event.delta;
      peak = Math.max(peak, concurrent);
    }
    if (peak > 2) {
      throw new Error(`expected peak concurrency <= 2, observed ${peak}`);
    }
  } finally {
    await Deno.remove(markerDir, { recursive: true });
  }
});

Deno.test("integration: trigger.* is available in if: expressions and script: steps", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    jobs: {
      build: {
        if: "trigger.tag == 'v1.2.3'",
        steps: [{ script: "./uses-ctx-trigger.ts" }],
      },
    },
  };
  const { outcomes } = await runWorkflow(workflow, {
    workflowDir,
    trigger: { tag: "v1.2.3", sha: "abc123" },
  });
  assertEquals(outcomes.build.result, "success");
  assertEquals(outcomes.build.outputs.sha, "abc123");
});

Deno.test("integration: variables precedence is Deno.env < workflow.variables < options.variables", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  Deno.env.set("ENSEMBLE_TEST_PRECEDENCE", "from-env");
  try {
    const workflow = {
      variables: { ENSEMBLE_TEST_PRECEDENCE: "from-workflow", WORKFLOW_ONLY: "from-workflow-only" },
      jobs: {
        build: {
          steps: [{ run: 'test "$ENSEMBLE_TEST_PRECEDENCE" = from-workflow && test "$WORKFLOW_ONLY" = from-workflow-only' }],
        },
      },
    };
    const { outcomes, success } = await runWorkflow(workflow, { workflowDir });
    assertEquals(success, true);
    assertEquals(outcomes.build.result, "success");

    const overridden = {
      ...workflow,
      jobs: {
        build: {
          steps: [{ run: 'test "$ENSEMBLE_TEST_PRECEDENCE" = from-options' }],
        },
      },
    };
    const overriddenRun = await runWorkflow(overridden, {
      workflowDir,
      variables: { ENSEMBLE_TEST_PRECEDENCE: "from-options" },
    });
    assertEquals(overriddenRun.success, true);
  } finally {
    Deno.env.delete("ENSEMBLE_TEST_PRECEDENCE");
  }
});

Deno.test("integration: a context.variables entry with an inline value never touches a loader", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    context: { variables: [{ name: "REGION", value: "us-east-1" }] },
    jobs: {
      build: {
        steps: [{ run: 'test "$REGION" = us-east-1 && test -f "$REGION_FILE" && test "$(cat "$REGION_FILE")" = us-east-1' }],
      },
    },
  };
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir });
  assertEquals(success, true);
  assertEquals(outcomes.build.result, "success");
});

Deno.test("integration: a workflow resolves a variable from the local loader's contexts/<name>/variables/<key>", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-local-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG"), "v1.2.3\n");

    const workflow = {
      context: { variables: [{ name: "IMAGE_TAG" }] },
      jobs: {
        build: { steps: [{ run: 'test "$IMAGE_TAG" = v1.2.3' }] },
      },
    };
    const { outcomes, success } = await runWorkflow(workflow, { workflowDir, context: "production" });
    assertEquals(success, true);
    assertEquals(outcomes.build.result, "success");
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: a loader-required variable with no matching loader value and no default fails before any job runs", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    context: { variables: [{ name: "DB_HOST" }] },
    jobs: {
      build: { steps: [{ run: "exit 0" }] },
    },
  };
  await assertRejects(
    () => runWorkflow(workflow, { workflowDir }),
    Error,
    "DB_HOST",
  );
});

Deno.test("integration: a loader-required variable falls back to its default when no context is selected", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    context: { variables: [{ name: "IMAGE_TAG", default: "latest" }] },
    jobs: {
      build: { steps: [{ run: 'test "$IMAGE_TAG" = latest' }] },
    },
  };
  const { success } = await runWorkflow(workflow, { workflowDir });
  assertEquals(success, true);
});

Deno.test("integration: --context-source local restricts resolution to the local loader only", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-source-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG"), "v1.2.3\n");

    const workflow = {
      context: { variables: [{ name: "IMAGE_TAG" }] },
      jobs: {
        build: { steps: [{ run: 'test "$IMAGE_TAG" = v1.2.3' }] },
      },
    };
    const { success } = await runWorkflow(workflow, { workflowDir, context: "production", contextSource: "local" });
    assertEquals(success, true);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: --context-source vault does not fall through to a local contexts/ folder that exists on disk", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-source-vault-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG"), "v1.2.3\n");

    const workflow = {
      context: { variables: [{ name: "IMAGE_TAG" }] },
      jobs: {
        build: { steps: [{ run: "exit 0" }] },
      },
    };
    await assertRejects(
      () => runWorkflow(workflow, { workflowDir, context: "production", contextSource: "vault" }),
      Error,
      "IMAGE_TAG",
    );
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: trigger is absent (not just empty) when no trigger is passed", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    jobs: {
      build: {
        if: "trigger.tag == 'v1.2.3'",
        steps: [{ run: "exit 0" }],
      },
    },
  };
  await assertRejects(
    () => runWorkflow(workflow, { workflowDir }),
    WorkflowExpressionError,
    "Unrecognized named-value: 'trigger'",
  );
});

Deno.test("integration: context.secrets resolves from the local loader's contexts/<name>/secrets/<key> in run: steps", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-secret-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "secrets", "GITHUB_WEBHOOK_SECRET"),
      "super-secret\n",
    );

    const workflow = {
      context: { secrets: [{ name: "GITHUB_WEBHOOK_SECRET" }] },
      jobs: {
        build: {
          steps: [{ run: 'test "$GITHUB_WEBHOOK_SECRET" = super-secret && test -n "$PATH" && test -n "$HOME"' }],
        },
      },
    };
    const { outcomes, success } = await runWorkflow(workflow, { workflowDir, context: "production" });
    assertEquals(success, true);
    assertEquals(outcomes.build.result, "success");
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: context.secrets is available to script: steps via ctx.variables", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-secret-script-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "secrets", "ENSEMBLE_TEST_ALLOWED_SECRET"),
      "visible\n",
    );
    Deno.env.delete("ENSEMBLE_TEST_FORBIDDEN_SECRET");

    const workflow = {
      context: { secrets: [{ name: "ENSEMBLE_TEST_ALLOWED_SECRET" }] },
      jobs: {
        build: {
          steps: [{ script: join(import.meta.dirname!, "tests", "fixtures", "reads-process-env.ts") }],
        },
      },
    };
    const { outcomes, success } = await runWorkflow(workflow, { workflowDir, context: "production" });
    assertEquals(success, true);
    assertEquals(outcomes.build.outputs, { allowed: "visible", forbidden: "" });
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: contextFile() resolves a raw file (no context.variables declaration needed) and is usable in a run: step", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-file-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "TF_VARS.json"), '{"a":1}');

    const workflow = {
      jobs: {
        build: {
          steps: [{ run: 'test -f "${{ contextFile(\'TF_VARS.json\') }}" && grep -q \'"a":1\' "${{ contextFile(\'TF_VARS.json\') }}"' }],
        },
      },
    };
    const { outcomes, success } = await runWorkflow(workflow, { workflowDir, context: "production" });
    assertEquals(success, true);
    assertEquals(outcomes.build.result, "success");
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: contextSecretFile() resolves from the secrets/ folder", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-secret-file-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "secrets", "creds.json"), '{"token":"abc"}');

    const workflow = {
      jobs: {
        build: {
          steps: [{ run: 'grep -q abc "${{ contextSecretFile(\'creds.json\') }}"' }],
        },
      },
    };
    const { success } = await runWorkflow(workflow, { workflowDir, context: "production" });
    assertEquals(success, true);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: an unresolvable contextFile() reference fails before any job runs", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "integration-context-file-missing-" });
  try {
    const workflow = {
      jobs: {
        build: { steps: [{ run: "echo ${{ contextFile('MISSING.json') }}" }] },
      },
    };
    await assertRejects(
      () => runWorkflow(workflow, { workflowDir, context: "production" }),
      Error,
      "MISSING.json",
    );
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
});

Deno.test("integration: context.secrets declaring an unresolvable name fails before any job runs", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  const workflow = {
    context: { secrets: [{ name: "ENSEMBLE_TEST_UNSET_SECRET" }] },
    jobs: {
      build: { steps: [{ run: "exit 0" }] },
    },
  };
  await assertRejects(
    () => runWorkflow(workflow, { workflowDir }),
    Error,
    "ENSEMBLE_TEST_UNSET_SECRET",
  );
});

Deno.test("integration: context.secrets can be satisfied by options.variables without touching Deno.env", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  Deno.env.delete("ENSEMBLE_TEST_CALLER_SECRET");
  const workflow = {
    context: { secrets: [{ name: "ENSEMBLE_TEST_CALLER_SECRET" }] },
    jobs: {
      build: {
        steps: [{ run: 'test "$ENSEMBLE_TEST_CALLER_SECRET" = from-caller' }],
      },
    },
  };
  const { outcomes, success } = await runWorkflow(workflow, {
    workflowDir,
    variables: { ENSEMBLE_TEST_CALLER_SECRET: "from-caller" },
  });
  assertEquals(success, true);
  assertEquals(outcomes.build.result, "success");
  assertEquals(Deno.env.get("ENSEMBLE_TEST_CALLER_SECRET"), undefined);
});

Deno.test("integration: no context: at all still forwards only PATH/HOME, not the full process env", async () => {
  const workflowDir = join(import.meta.dirname!, "tests", "fixtures");
  Deno.env.set("ENSEMBLE_TEST_UNSCOPED", "still-visible");
  try {
    const workflow = {
      jobs: {
        build: {
          steps: [{ run: 'test -z "$ENSEMBLE_TEST_UNSCOPED" && test -n "$PATH" && test -n "$HOME"' }],
        },
      },
    };
    const { success } = await runWorkflow(workflow, { workflowDir });
    assertEquals(success, true);
  } finally {
    Deno.env.delete("ENSEMBLE_TEST_UNSCOPED");
  }
});

Deno.test("integration: a job depending on a hard-failed job is skipped, not run", async () => {
  const file = join(examplesDir, "failing-step.yml");
  const workflow = await parseWorkflowFile(file);
  // Force test's script step to hard-fail (no continue-on-error) by editing the in-memory workflow.
  workflow.jobs.test.steps[0]["continue-on-error"] = false;
  const { outcomes, success } = await runWorkflow(workflow, { workflowDir: dirname(file) });
  assertEquals(outcomes.test.result, "failure");
  assertEquals(outcomes.deploy.result, "skipped");
  assertEquals(success, false);
});
