import * as Core from "@ensemble/core";

export interface ClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must be a token granted "upload" in the server's .ensemble/platform/tokens.json. */
  token: string;
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
  return {
    actions: {
      async upload(name: string, tarGz: BodyInit): Promise<UploadResponse> {
        const response = await fetch(new URL(`/v1/workflows/${Core.Workflows.encodeWorkflowId(name)}`, options.baseUrl), {
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
