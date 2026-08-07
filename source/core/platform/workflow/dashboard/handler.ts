import {
  decodeWorkflowId,
  deleteRun,
  encodeWorkflowId,
  getLatestRun,
  getRun,
  getRunSteps,
  getStepLog,
  getWorkflowByName,
  listRunsForWorkflow,
  listWorkflowFiles,
  listWorkflows,
  readWorkflowFile,
  subscribeToRun,
  syncGitIntegrationForWorkflow,
  trackedRunWorkflowByName,
} from "@ensemble/core";
import { setCookie } from "@std/http/cookie";
import { isAuthorizedFor, SSE_TOKEN_COOKIE } from "../../auth/tokens.ts";
import type {
  DeleteRunResponse,
  GetStepLogResponse,
  ListRunsResponse,
  ListRunStepsResponse,
  ListWorkflowFilesResponse,
  ListWorkflowsResponse,
  MintSseTokenResponse,
  ReadWorkflowFileResponse,
  RunJobNode,
  RunWorkflowResponse,
  WorkflowContextsSummary,
  WorkflowTriggerSummary,
} from "./contract.ts";
import type { Contexts, Trigger } from "@ensemble/workflow";

function summarizeTrigger(trigger: Trigger, jobIds: string[]): WorkflowTriggerSummary | undefined {
  if (trigger.manual) return { type: "manual", inputs: trigger.manual.inputs ?? [], jobs: jobIds };
  if (trigger.github) return { type: "github", tagPatterns: trigger.github.push.tags };
  return undefined;
}

function summarizeContexts(contexts: Contexts | undefined): WorkflowContextsSummary | undefined {
  if (contexts === undefined) return undefined;
  return { names: Object.keys(contexts.entries), defaultName: contexts.default };
}

/** Decodes the ":id" route param back into a workflow name, or responds 400 if missing/invalid. */
function resolveWorkflowNameParam(
  params: Record<string, string | undefined>,
): { name: string } | { errorResponse: Response } {
  const id = params.id;
  if (!id) {
    return { errorResponse: Response.json({ error: "Missing workflow id in URL." }, { status: 400 }) };
  }
  try {
    return { name: decodeWorkflowId(id) };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

export async function handleListWorkflows(request: Request): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = await listWorkflows();
  const workflows = await Promise.all(resolved.map(async ({ name, workflow }) => {
    const latest = await getLatestRun(name);
    const jobIds = Object.keys(workflow.jobs);
    const triggers = (workflow.on ?? [])
      .map((trigger) => summarizeTrigger(trigger, jobIds))
      .filter((t): t is WorkflowTriggerSummary => t !== undefined);
    return {
      id: encodeWorkflowId(name),
      name,
      lastStatus: latest?.status,
      lastRunAt: latest?.startedAt,
      triggers,
      contexts: summarizeContexts(workflow.contexts),
    };
  }));

  return Response.json({ workflows } satisfies ListWorkflowsResponse);
}

export async function handleListRuns(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const runs = await listRunsForWorkflow(resolved.name);
  return Response.json({ runs } satisfies ListRunsResponse);
}

export async function handleListRunSteps(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const runId = params.runId;
  if (!runId) {
    return Response.json({ error: "Missing run id in URL." }, { status: 400 });
  }

  const steps = await getRunSteps(runId, resolved.name);
  if (steps === undefined) {
    return Response.json({ error: `Run "${runId}" not found.` }, { status: 404 });
  }

  const { workflow } = await getWorkflowByName(resolved.name);
  const jobs: RunJobNode[] = Object.entries(workflow.jobs).map(([id, job]) => ({
    id,
    needs: job.needs ?? [],
  }));

  return Response.json({ steps, jobs } satisfies ListRunStepsResponse);
}

export async function handleGetStepLog(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const runId = params.runId;
  const jobId = params.jobId;
  const index = params.index !== undefined ? Number(params.index) : NaN;
  if (!runId || !jobId || Number.isNaN(index)) {
    return Response.json({ error: "Missing or invalid run id, job id, or step index in URL." }, { status: 400 });
  }

  const log = await getStepLog(runId, jobId, index, resolved.name);
  if (log === undefined) {
    return Response.json({ error: `No log found for run "${runId}", job "${jobId}", step ${index}.` }, {
      status: 404,
    });
  }
  return Response.json(log satisfies GetStepLogResponse);
}

export async function handleListWorkflowFiles(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    const files = await listWorkflowFiles(resolved.name);
    return Response.json({ files } satisfies ListWorkflowFilesResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}

export async function handleRunWorkflow(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "trigger")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  try {
    await syncGitIntegrationForWorkflow(resolved.name);
    const success = await trackedRunWorkflowByName(resolved.name, { trigger: { type: "manual" } });
    return Response.json({ success } satisfies RunWorkflowResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

/**
 * Deletes a run's record and all of its step logs. Allowed regardless of
 * status — including in_progress — since the only way to clear a run
 * stranded there by a crash/restart is to remove it; this doesn't stop any
 * still-running workflow process, it only removes the tracking record.
 * Gated by "trigger" rather than a dedicated permission, since anything
 * that can start a run is already trusted to mutate run state.
 */
export async function handleDeleteRun(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "trigger")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const runId = params.runId;
  if (!runId) {
    return Response.json({ error: "Missing run id in URL." }, { status: 400 });
  }

  const deleted = await deleteRun(runId, resolved.name);
  if (!deleted) {
    return Response.json({ error: `Run "${runId}" not found.` }, { status: 404 });
  }
  return Response.json({ success: true } satisfies DeleteRunResponse);
}

export async function handleReadWorkflowFile(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const path = params["0"];
  if (!path) {
    return Response.json({ error: "Missing file path in URL." }, { status: 400 });
  }

  try {
    const content = await readWorkflowFile(resolved.name, path);
    return Response.json({ content } satisfies ReadWorkflowFileResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}

/**
 * Exchanges a valid bearer token for a short-lived `sse_token` cookie, so
 * an `EventSource` connection (which can't set an Authorization header) can
 * still authenticate. The cookie carries the same token, just narrowly
 * scoped (path, short max-age) rather than being a separate credential —
 * see auth/tokens.ts's isAuthorizedFor for the matching read side.
 */
export async function handleMintSseToken(request: Request): Promise<Response> {
  // Deliberately checks the header directly, rather than going through
  // isAuthorizedFor (which also accepts the sse_token cookie this endpoint
  // mints) — minting must always start from a real bearer token, never from
  // a cookie re-minting itself.
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }
  const token = header.slice("Bearer ".length);
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const response = Response.json({ ok: true } satisfies MintSseTokenResponse);
  setCookie(response.headers, {
    name: SSE_TOKEN_COOKIE,
    value: token,
    path: "/v1/workflows",
    maxAge: 60,
    httpOnly: true,
    sameSite: "Strict",
  });
  return response;
}

const SSE_ENCODER = new TextEncoder();

/** Streams `record` as a single SSE `data:` message. */
function formatSseEvent(record: unknown): Uint8Array {
  return SSE_ENCODER.encode(`data: ${JSON.stringify(record)}\n\n`);
}

/**
 * Streams live status updates for a single run over SSE: job/step state
 * transitions, not log output (logs stay fetched on demand via
 * handleGetStepLog). Pushes an immediate snapshot on connect — closing the
 * race where the run finishes between the dashboard's initial REST fetch
 * and this subscription — then forwards every subsequent update published
 * by trackedRunWorkflow (see core/runs-broadcast.ts) until the client
 * disconnects.
 */
export async function handleRunEvents(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "read")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const resolved = resolveWorkflowNameParam(params);
  if ("errorResponse" in resolved) return resolved.errorResponse;

  const runId = params.runId;
  if (!runId) {
    return Response.json({ error: "Missing run id in URL." }, { status: 400 });
  }

  const initial = await getRun(runId, resolved.name);
  if (initial === undefined) {
    return Response.json({ error: `Run "${runId}" not found.` }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(formatSseEvent(initial));
      const unsubscribe = subscribeToRun(runId, (record) => {
        controller.enqueue(formatSseEvent(record));
      });
      request.signal.addEventListener("abort", unsubscribe);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
