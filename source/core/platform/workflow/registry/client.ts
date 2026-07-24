export interface WorkflowRegistryClientOptions {
  baseUrl: string;
  /** Sent as `Authorization: Bearer <token>` — must match the server's ENSEMBLE_WORKFLOW_REGISTRY_TOKEN. */
  token: string;
}

export interface WorkflowUploadResponse {
  success: boolean;
}

export interface WorkflowRegistryClient {
  actions: {
    /** Uploads a .tar.gz of a workflow's whole directory tree, replacing workflows/<name>. */
    upload(name: string, tarGz: BodyInit): Promise<WorkflowUploadResponse>;
  };
}

export function workflowRegistryClient(options: WorkflowRegistryClientOptions): WorkflowRegistryClient {
  return {
    actions: {
      async upload(name: string, tarGz: BodyInit): Promise<WorkflowUploadResponse> {
        const response = await fetch(new URL(`/workflows/${encodeURIComponent(name)}`, options.baseUrl), {
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
        return body as WorkflowUploadResponse;
      },
    },
  };
}
