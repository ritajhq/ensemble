import { encodeWorkflowId } from "@ensemble/core";
import type { HttpTriggerRequest, HttpTriggerResponse } from "./contract.ts";

export interface HttpTriggerClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "trigger" in the server's .ensemble/tokens.json. */
  token: string;
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
        const response = await fetch(new URL(`/v1/workflows/${encodeWorkflowId(name)}/trigger`, options.baseUrl), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.token}`,
          },
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
