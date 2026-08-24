import * as Core from "@ensemble/core";
import type { TriggerRequest, TriggerResponse } from "./contract.ts";

export interface ClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "trigger" in the server's .ensemble/platform/tokens.json. */
  token: string;
  /** The remote server's own /v1/workflows base path — must match its PlatformRoutePrefixes.workflowsBasePath. Defaults to "/v1/workflows". */
  workflowsBasePath?: string;
}

export interface Client {
  actions: {
    trigger(name: string, request?: TriggerRequest): Promise<TriggerResponse>;
  };
}

export function client(options: ClientOptions): Client {
  const basePath = options.workflowsBasePath ?? "/v1/workflows";
  return {
    actions: {
      async trigger(name: string, request: TriggerRequest = {}): Promise<TriggerResponse> {
        const response = await fetch(new URL(`${basePath}/${Core.Workflows.encodeWorkflowId(name)}/trigger`, options.baseUrl), {
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
        return body as TriggerResponse;
      },
    },
  };
}
