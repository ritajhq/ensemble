import type { TriggerWorkflowRequest, TriggerWorkflowResponse } from "./contract.ts";

export interface TriggerWorkflowClientOptions {
  baseUrl: string;
}

export interface TriggerWorkflowClient {
  actions: {
    trigger(request: TriggerWorkflowRequest): Promise<TriggerWorkflowResponse>;
  };
}

export function triggerWorkflowClient(options: TriggerWorkflowClientOptions): TriggerWorkflowClient {
  return {
    actions: {
      async trigger(request: TriggerWorkflowRequest): Promise<TriggerWorkflowResponse> {
        const response = await fetch(new URL("/trigger-workflow", options.baseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? `trigger-workflow request failed with status ${response.status}`);
        }
        return body as TriggerWorkflowResponse;
      },
    },
  };
}
