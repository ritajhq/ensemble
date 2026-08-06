import type { Delegate } from "@ritaj/event";
import { isEventLine, parseEventLine, type RunWorkflowResult, type WorkflowEvent } from "@ensemble/workflow";

export interface RunWorkflowInContainerOptions {
  /** Run only this job (or these jobs) and their transitive dependencies. */
  job?: string | string[];
  concurrency?: number;
  context?: string;
  /** Data from whatever triggered this run, forwarded into the container as --trigger-json. */
  trigger?: Record<string, unknown>;
  /** Notified as jobs/steps start/finish inside the container, reconstructed from its stdout. */
  events?: Delegate<[WorkflowEvent]>;
}

/** Host path to workflows/ that the runner container mounts read-only at /workspace/workflows. */
function hostWorkflowsPath(): string {
  const path = Deno.env.get("ENSEMBLE_HOST_WORKFLOWS_PATH");
  if (!path) {
    throw new Error("ENSEMBLE_HOST_WORKFLOWS_PATH is not set — required to spawn a containerized workflow run.");
  }
  return path;
}

function runnerImage(): string {
  return Deno.env.get("ENSEMBLE_RUNNER_IMAGE") ?? "runner:latest";
}

/** Reads a piped stream line-by-line, dispatching structured event lines and mirroring everything else to `mirror`. */
async function pumpEvents(
  stream: ReadableStream<Uint8Array>,
  mirror: { write(p: Uint8Array): Promise<number> | number },
  events: Delegate<[WorkflowEvent]> | undefined,
): Promise<void> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  function handleLine(line: string) {
    if (isEventLine(line)) {
      events?.Invoke(parseEventLine(line));
      return Promise.resolve(0);
    }
    return mirror.write(encoder.encode(line + "\n"));
  }

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      await handleLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.length > 0) await handleLine(buffer);
}

/**
 * Runs a workflow inside a fresh sibling `runner` container instead of
 * in-process, so the server itself never needs the workflow's own toolchain
 * (git/gh/docker-cli/etc.) baked in. The container mounts only what
 * getWorkflowByName needs to resolve workflows/<name>/workflow.yml — a
 * read-only bind of the host's workflows/ directory plus an empty .ensemble/
 * marker dir (its contents are never read on this path) — not the whole repo.
 *
 * The inner `ens workflow --emit-events` invocation emits structured
 * WorkflowEvents on its own stdout (see event-log.ts); this reconstructs them
 * into `events`, so a caller tracking the run (trackedRunWorkflowByName, see
 * workflow.ts) sees the exact same event stream it would from an in-process
 * run — no changes needed to run tracking/SSE/dashboard code.
 */
export async function runWorkflowInContainer(
  name: string,
  options: RunWorkflowInContainerOptions,
): Promise<RunWorkflowResult> {
  const emptyEnsembleDir = await Deno.makeTempDir({ prefix: "ensemble-runner-marker-" });
  try {
    const args = [
      "run",
      "--rm",
      "-v",
      `${hostWorkflowsPath()}:/workspace/workflows:ro`,
      "-v",
      `${emptyEnsembleDir}:/workspace/.ensemble`,
      runnerImage(),
      "workflow",
      name,
      "--emit-events",
    ];
    for (const job of options.job === undefined ? [] : Array.isArray(options.job) ? options.job : [options.job]) {
      args.push("--job", job);
    }
    if (options.concurrency !== undefined) args.push("--concurrency", String(options.concurrency));
    if (options.context !== undefined) args.push("--context", options.context);
    if (options.trigger !== undefined) args.push("--trigger-json", JSON.stringify(options.trigger));

    const command = new Deno.Command("docker", { args, stdout: "piped", stderr: "piped" });
    const child = command.spawn();

    await Promise.all([
      pumpEvents(child.stdout, Deno.stdout, options.events),
      pumpEvents(child.stderr, Deno.stderr, undefined),
    ]);

    const { success } = await child.status;
    return { outcomes: {}, success };
  } finally {
    await Deno.remove(emptyEnsembleDir, { recursive: true }).catch(() => {});
  }
}
