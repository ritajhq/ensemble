import { decodeWorkflowId, getWorkflowByName, trackedRunWorkflowByName } from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import { extractManualInputs, ManualInputError, resolveJobInput } from "./extract.ts";
import { isManualTriggerRequest, type ManualTriggerResponse } from "./contract.ts";

export async function handleManualTrigger(
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "trigger")) {
    return Response.json({ error: "Missing or invalid bearer token." }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing workflow id in URL." }, { status: 400 });
  }
  let name: string;
  try {
    name = decodeWorkflowId(id);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  const text = await request.text();
  let body: unknown = {};
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
  }
  if (!isManualTriggerRequest(body)) {
    return Response.json({
      error:
        "Expected { job?: string | string[], concurrency?: number, variables?: Record<string,string>, context?: string, inputs?: Record<string,unknown> }.",
    }, { status: 400 });
  }

  let workflow;
  try {
    ({ workflow } = await getWorkflowByName(name));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }

  const manualTrigger = workflow.on?.find((t) => t.manual)?.manual;
  if (!manualTrigger) {
    return Response.json(
      { error: `Workflow "${name}" has no "manual" trigger declared under "on:".` },
      { status: 403 },
    );
  }

  const declaredInputs = manualTrigger.inputs ?? [];
  let trigger: Record<string, unknown>;
  try {
    trigger = extractManualInputs(body.inputs, declaredInputs, Object.keys(workflow.jobs));
  } catch (error) {
    if (error instanceof ManualInputError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  trigger.type = "manual";

  try {
    const success = await trackedRunWorkflowByName(name, {
      job: body.job ?? resolveJobInput(declaredInputs, trigger),
      concurrency: body.concurrency,
      variables: body.variables,
      context: body.context,
      trigger,
    });
    return Response.json({ success } satisfies ManualTriggerResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
