import {
  decodeWorkflowId,
  encodeWorkflowId,
  getLatestRun,
  getRunSteps,
  getStepLog,
  listRunsForWorkflow,
  listWorkflowFiles,
  listWorkflows,
  readWorkflowFile,
  runWorkflowByName,
} from "@ensemble/core";
import { isAuthorizedFor } from "../../auth/tokens.ts";
import type {
  GetStepLogResponse,
  ListRunsResponse,
  ListRunStepsResponse,
  ListWorkflowFilesResponse,
  ListWorkflowsResponse,
  ReadWorkflowFileResponse,
  RunWorkflowResponse,
  WorkflowTriggerSummary,
} from "./contract.ts";
import type { Trigger } from "@ensemble/workflow";

function summarizeTrigger(trigger: Trigger): WorkflowTriggerSummary | undefined {
  if (trigger.manual) return { type: "manual", inputs: trigger.manual.inputs ?? [] };
  if (trigger.github) return { type: "github", tagPatterns: trigger.github.push.tags };
  return undefined;
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
    const triggers = (workflow.on ?? [])
      .map(summarizeTrigger)
      .filter((t): t is WorkflowTriggerSummary => t !== undefined);
    return { id: encodeWorkflowId(name), name, lastStatus: latest?.status, lastRunAt: latest?.startedAt, triggers };
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
  return Response.json({ steps } satisfies ListRunStepsResponse);
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
    const success = await runWorkflowByName(resolved.name, { trigger: { type: "manual" } });
    return Response.json({ success } satisfies RunWorkflowResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
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
