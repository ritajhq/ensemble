import { decodeWorkflowId, getWorkflowByName, runWorkflowByName } from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import { extractTriggerPayload } from "./extract.ts";
import { isHttpTriggerRequest, type HttpTriggerResponse } from "./contract.ts";

export async function handleHttpTrigger(
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
  if (!isHttpTriggerRequest(body)) {
    return Response.json({
      error:
        "Expected { job?: string, concurrency?: number, variables?: Record<string,string>, context?: string, payload?: unknown }.",
    }, { status: 400 });
  }

  let workflow;
  try {
    ({ workflow } = await getWorkflowByName(name));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }

  const httpTrigger = workflow.on?.find((t) => t.http)?.http;
  if (!httpTrigger) {
    return Response.json(
      { error: `Workflow "${name}" has no "http" trigger declared under "on:".` },
      { status: 403 },
    );
  }

  const trigger = httpTrigger.payload ? extractTriggerPayload(body.payload, httpTrigger.payload) : undefined;

  try {
    const success = await runWorkflowByName(name, {
      job: body.job,
      concurrency: body.concurrency,
      variables: body.variables,
      context: body.context,
      trigger,
    });
    return Response.json({ success } satisfies HttpTriggerResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
