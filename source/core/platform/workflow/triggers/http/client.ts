import type { HttpTriggerRequest, HttpTriggerResponse } from "./contract.ts";

export interface HttpTriggerClientOptions {
  baseUrl: string;
}

export interface HttpTriggerClient {
  actions: {
    trigger(name: string, request?: HttpTriggerRequest): Promise<HttpTriggerResponse>;
  };
}

export function httpTriggerClient(options: HttpTriggerClientOptions): HttpTriggerClient {
  return {
    actions: {
      async trigger(name: string, request: HttpTriggerRequest = {}): Promise<HttpTriggerResponse> {
        const response = await fetch(new URL(`/workflows/${encodeURIComponent(name)}/trigger`, options.baseUrl), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? `http trigger request failed with status ${response.status}`);
        }
        return body as HttpTriggerResponse;
      },
    },
  };
}
