import { encodeWorkflowId } from "@ensemble/core";
import type { ManualTriggerRequest, ManualTriggerResponse } from "./contract.ts";

export interface ManualTriggerClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "trigger" in the server's .ensemble/platform/tokens.json. */
  token: string;
}

export interface ManualTriggerClient {
  actions: {
    trigger(name: string, request?: ManualTriggerRequest): Promise<ManualTriggerResponse>;
  };
}

export function manualTriggerClient(options: ManualTriggerClientOptions): ManualTriggerClient {
  return {
    actions: {
      async trigger(name: string, request: ManualTriggerRequest = {}): Promise<ManualTriggerResponse> {
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
          throw new Error(body.error ?? `manual trigger request failed with status ${response.status}`);
        }
        return body as ManualTriggerResponse;
      },
    },
  };
}
