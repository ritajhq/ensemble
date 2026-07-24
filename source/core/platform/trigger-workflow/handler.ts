import { runWorkflowByName } from "@ensemble/core";
import { isTriggerWorkflowRequest, type TriggerWorkflowResponse } from "./contract.ts";

export async function handleTriggerWorkflow(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isTriggerWorkflowRequest(body)) {
    return Response.json({
      error: "Expected { name: string, job?: string, concurrency?: number, variables?: Record<string,string> }.",
    }, { status: 400 });
  }

  try {
    const success = await runWorkflowByName(body.name, {
      job: body.job,
      concurrency: body.concurrency,
      variables: body.variables,
    });
    return Response.json({ success } satisfies TriggerWorkflowResponse);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
