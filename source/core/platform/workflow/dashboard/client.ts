import * as Core from "@ensemble/core";
import type { GetStepLogResponse, ListRunsResponse, ListRunStepsResponse, ListWorkflowsResponse } from "./contract.ts";

export interface ClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "read" in the server's .ensemble/platform/tokens.json. */
  token: string;
  /** The remote server's own /v1/workflows base path — must match its PlatformRoutePrefixes.workflowsBasePath. Defaults to "/v1/workflows". */
  workflowsBasePath?: string;
}

export interface Client {
  queries: {
    listWorkflows(): Promise<ListWorkflowsResponse>;
    listRuns(name: string): Promise<ListRunsResponse>;
    listRunSteps(name: string, runId: string): Promise<ListRunStepsResponse>;
    getStepLog(name: string, runId: string, jobId: string, index: number): Promise<GetStepLogResponse>;
  };
}

async function getJson<T>(url: URL, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `dashboard request failed with status ${response.status}`);
  }
  return body as T;
}

export function client(options: ClientOptions): Client {
  const basePath = options.workflowsBasePath ?? "/v1/workflows";
  return {
    queries: {
      listWorkflows(): Promise<ListWorkflowsResponse> {
        return getJson(new URL(basePath, options.baseUrl), options.token);
      },
      listRuns(name: string): Promise<ListRunsResponse> {
        return getJson(new URL(`${basePath}/${Core.Workflows.encodeWorkflowId(name)}/runs`, options.baseUrl), options.token);
      },
      listRunSteps(name: string, runId: string): Promise<ListRunStepsResponse> {
        return getJson(
          new URL(`${basePath}/${Core.Workflows.encodeWorkflowId(name)}/runs/${runId}/steps`, options.baseUrl),
          options.token,
        );
      },
      getStepLog(name: string, runId: string, jobId: string, index: number): Promise<GetStepLogResponse> {
        return getJson(
          new URL(
            `${basePath}/${Core.Workflows.encodeWorkflowId(name)}/runs/${runId}/steps/${encodeURIComponent(jobId)}/${index}/log`,
            options.baseUrl,
          ),
          options.token,
        );
      },
    },
  };
}
