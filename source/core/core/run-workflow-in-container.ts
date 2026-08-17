import type { Delegate } from "@ritaj/event";
import {
  isEventLine,
  parseEventLine,
  type RunWorkflowResult,
  type WorkflowEvent,
} from "@ensemble/workflow";

export interface RunWorkflowInContainerOptions {
  /** Run only this job (or these jobs) and their transitive dependencies. */
  job?: string | string[];
  concurrency?: number;
  context?: string;
  /** Data from whatever triggered this run, forwarded into the container as --trigger-json. */
  trigger?: Record<string, unknown>;
  /**
   * The X25519 private key belonging to the git repository this workflow is
   * linked to (see core/workflow.ts's runWorkflowByName, which resolves
   * this via WorkflowGitLink -> GitRepositoryRecord.secretsKey before
   * calling here) — forwarded into the container as ENSEMBLE_SECRETS_KEY so
   * the run can decrypt its own context.secrets. Undefined when the
   * workflow has no git link, or that repo has no key configured — the run
   * proceeds without one, same graceful-degradation shape as always (only
   * an actual encrypted-secret lookup fails, and only then).
   */
  secretsKey?: string;
  /** Notified as jobs/steps start/finish inside the container, reconstructed from its stdout. */
  events?: Delegate<[WorkflowEvent]>;
}

/** Host path to workflows/ that the runner container mounts read-only at /workspace/workflows. */
function hostWorkflowsPath(): string {
  const path = Deno.env.get("ENSEMBLE_HOST_WORKFLOWS_PATH");
  if (!path) {
    throw new Error(
      "ENSEMBLE_HOST_WORKFLOWS_PATH is not set — required to spawn a containerized workflow run.",
    );
  }
  return path;
}

function runnerImage(): string {
  return Deno.env.get("ENSEMBLE_RUNNER_IMAGE") ?? "runner:latest";
}

const DOCKER_SOCKET_PATH = "/var/run/docker.sock";

/**
 * The docker socket's owning GID, so the runner container's non-root user can
 * be added to it via --group-add. Read directly off the socket file rather
 * than via `getent group docker` — inside a container, /etc/group has no
 * named "docker" entry even when the socket itself is bind-mounted in, since
 * that group only exists by name on the host.
 */
async function dockerGid(): Promise<string> {
  const info = await Deno.stat(DOCKER_SOCKET_PATH);
  if (info.gid === null) {
    throw new Error(
      `Could not determine the owning GID of ${DOCKER_SOCKET_PATH}`,
    );
  }
  return String(info.gid);
}

/**
 * Env vars that configure spawning the runner container itself, not
 * meaningful to forward into it. ENSEMBLE_SECRETS_KEY is deliberately
 * excluded from blind forwarding even if the server process happens to have
 * one set (e.g. a stray leftover from before per-repository key custody) —
 * the only key that should reach a run is the specific repo's own,
 * explicitly passed via `options.secretsKey` below, never whatever the
 * server's own process env happens to contain.
 */
const UNFORWARDED_ENV_VARS = new Set([
  "ENSEMBLE_RUNNER_IMAGE",
  "ENSEMBLE_HOST_WORKFLOWS_PATH",
  "ENSEMBLE_SECRETS_KEY",
]);

/**
 * Writes every other env var on this process to a temp --env-file, so steps
 * see the same env they'd get running in-process. An env file (not repeated
 * -e NAME=value args) so secrets like REGISTRY_PASSWORD never appear in the
 * spawned `docker run` process's own argv — visible host-side via `ps`
 * while it runs, unlike a file only docker itself reads. Also injects
 * ENSEMBLE_SECRETS_KEY from `secretsKey` (the resolved per-repository key,
 * not anything from the server's own env — see UNFORWARDED_ENV_VARS above)
 * when one was resolved, letting the run decrypt its own context.secrets
 * entirely inside the container — no callback to the server needed.
 */
async function writeForwardedEnvFile(
  secretsKey: string | undefined,
): Promise<string> {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    if (UNFORWARDED_ENV_VARS.has(name)) continue;
    lines.push(`${name}=${value}`);
  }
  if (secretsKey !== undefined) {
    lines.push(`ENSEMBLE_SECRETS_KEY=${secretsKey}`);
  }
  const path = await Deno.makeTempFile({ prefix: "ensemble-runner-env-" });
  await Deno.writeTextFile(path, lines.join("\n") + "\n");
  return path;
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
 * The docker socket is also bind-mounted (with --group-add so the runner's
 * non-root user can use it) since workflow steps themselves may shell out to
 * docker/docker compose (e.g. workflows/local, workflows/deploy) — the same
 * pattern server's own docker-compose.yml/main.tf use for itself.
 *
 * The server process's own environment is forwarded into the container (via
 * a temp --env-file, not repeated -e args — keeps secret values out of the
 * `docker run` process's own argv) so steps that read secrets/config
 * straight off the process env (e.g. `$REGISTRY_USERNAME`, per
 * @ensemble/workflow's README — there's no separate secrets/allowlist
 * mechanism) see the same values a step would've seen running in-process.
 * This mirrors Deno.Command's default env inheritance, which `docker run`
 * does not do on its own. `options.secretsKey` — the specific git
 * repository's own X25519 private key this workflow is linked to, resolved
 * by the caller (see core/workflow.ts's runWorkflowByName) — is injected as
 * ENSEMBLE_SECRETS_KEY, letting the run decrypt its own context.secrets (see
 * @ensemble/workflow's context-loaders/secrets-crypto.ts) entirely inside
 * the container. Never sourced from the server's own env (see
 * UNFORWARDED_ENV_VARS) — each repo's key is scoped to that repo alone.
 *
 * The inner `ens workflow run --emit-events` invocation emits structured
 * WorkflowEvents on its own stdout (see event-log.ts); this reconstructs them
 * into `events`, so a caller tracking the run (trackedRunWorkflowByName, see
 * workflow.ts) sees the exact same event stream it would from an in-process
 * run — no changes needed to run tracking/SSE/dashboard code.
 */
export async function runWorkflowInContainer(
  name: string,
  options: RunWorkflowInContainerOptions,
): Promise<RunWorkflowResult> {
  const emptyEnsembleDir = await Deno.makeTempDir({
    prefix: "ensemble-runner-marker-",
  });
  const envFile = await writeForwardedEnvFile(options.secretsKey);
  try {
    const args = [
      "run",
      "--rm",
      "-v",
      `${hostWorkflowsPath()}:/workspace/workflows:ro`,
      "-v",
      `${emptyEnsembleDir}:/workspace/.ensemble`,
      "-v",
      `${DOCKER_SOCKET_PATH}:${DOCKER_SOCKET_PATH}`,
      "--group-add",
      await dockerGid(),
      "--env-file",
      envFile,
      runnerImage(),
      "workflow",
      "run",
      name,
      "--emit-events",
    ];
    for (
      const job of options.job === undefined
        ? []
        : Array.isArray(options.job)
        ? options.job
        : [options.job]
    ) {
      args.push("--job", job);
    }
    if (options.concurrency !== undefined) {
      args.push("--concurrency", String(options.concurrency));
    }
    if (options.context !== undefined) args.push("--context", options.context);
    if (options.trigger !== undefined) {
      args.push("--trigger-json", JSON.stringify(options.trigger));
    }

    const command = new Deno.Command("docker", {
      args,
      stdout: "piped",
      stderr: "piped",
    });
    const child = command.spawn();

    await Promise.all([
      pumpEvents(child.stdout, Deno.stdout, options.events),
      pumpEvents(child.stderr, Deno.stderr, undefined),
    ]);

    const { success } = await child.status;
    return { outcomes: {}, success };
  } finally {
    await Deno.remove(emptyEnsembleDir, { recursive: true }).catch(() => {});
    await Deno.remove(envFile).catch(() => {});
  }
}
