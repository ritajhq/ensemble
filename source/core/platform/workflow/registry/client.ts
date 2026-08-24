import * as Core from "@ensemble/core";

export interface ClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "upload" in the server's .ensemble/platform/tokens.json. */
  token: string;
  /** The remote server's own /v1/workflows base path — must match its PlatformRoutePrefixes.workflowsBasePath. Defaults to "/v1/workflows". */
  workflowsBasePath?: string;
}

export interface UploadResponse {
  success: boolean;
}

export interface Client {
  actions: {
    /** Uploads a .tar.gz of a workflow's whole directory tree, replacing workflows/<name>. */
    upload(name: string, tarGz: BodyInit): Promise<UploadResponse>;
  };
}

export function client(options: ClientOptions): Client {
  const basePath = options.workflowsBasePath ?? "/v1/workflows";
  return {
    actions: {
      async upload(name: string, tarGz: BodyInit): Promise<UploadResponse> {
        const response = await fetch(new URL(`${basePath}/${Core.Workflows.encodeWorkflowId(name)}`, options.baseUrl), {
          method: "PUT",
          headers: {
            "content-type": "application/gzip",
            authorization: `Bearer ${options.token}`,
          },
          body: tarGz,
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? `workflow upload failed with status ${response.status}`);
        }
        return body as UploadResponse;
      },
    },
  };
}
