import * as Core from "@ensemble/core";
import { setCookie } from "@std/http/cookie";
import { isAuthorizedFor, WS_TOKEN_COOKIE } from "../../auth/tokens.ts";
import type {
  CreateWorkflowResponse,
  DeleteRunResponse,
  DeleteWorkflowResponse,
  GetStepLogResponse,
  GetWorkflowResponse,
  ListRunsResponse,
  ListRunStepsResponse,
  ListWorkflowFilesResponse,
  ListWorkflowsResponse,
  MintWsTokenResponse,
  ReadWorkflowFileResponse,
  RenameWorkflowResponse,
  RunJobNode,
  RunWorkflowResponse,
  WorkflowTriggerSummary,
} from "./contract.ts";
import { isCreateWorkflowRequest, isRenameWorkflowRequest } from "./contract.ts";
import type { Trigger, Workflow } from "@ensemble/workflow";

function summarizeTrigger(
  trigger: Trigger,
  jobIds: string[],
): WorkflowTriggerSummary | undefined {
  if (trigger.manual) {
    return {
      type: "manual",
      inputs: trigger.manual.inputs ?? [],
      jobs: jobIds,
    };
  }
  if (trigger.github) {
    return {
      type: "github",
      tagPatterns: trigger.github.push.tags,
      context: trigger.github.context,
    };
  }
  return undefined;
}

/** Decodes the ":id" route param back into a workflow name, or responds 400 if missing/invalid. */
function resolveWorkflowNameParam(
  params: Record<string, string | undefined>,
): { name: string } | { errorResponse: Response } {
  const id = params.id;
  if (!id) {
    return {
      errorResponse: Response.json({ error: "Missing workflow id in URL." }, {
        status: 400,
      }),
    };
  }
  try {
    return { name: Core.Workflows.decodeWorkflowId(id) };
  } catch (error) {
    return {
      errorResponse: Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 }),
    };
  }
}

/** The store instances the dashboard's handlers are constructed with — one shared shape with the platform's own PlatformStores. */
export interface DashboardStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/** HTTP handlers for /v1/workflows, /v1/auth/ws-token, and their run/file sub-resources, constructor-injected with the stores they operate on. */
export class DashboardHandlers {
  private readonly repositories: Core.GitRepositories.GitRepositoryStore;
  private readonly links: Core.GitRepositories.WorkflowGitLinkStore;
  private readonly runs: Core.Runs.RunStore;

  constructor(stores: DashboardStores) {
    this.repositories = stores.repositories;
    this.links = stores.links;
    this.runs = stores.runs;
  }

  /** Responds 401 if `request` isn't authorized for `scope`, otherwise undefined. */
  private async requireAuth(
    request: Request,
    scope: "read" | "upload" | "trigger",
  ): Promise<Response | undefined> {
    if (await isAuthorizedFor(request, scope)) return undefined;
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

  /** Parses `request`'s body as JSON, or an error Response if it isn't valid JSON. */
  private async parseJsonBody(
    request: Request,
  ): Promise<{ body: unknown } | { errorResponse: Response }> {
    const text = await request.text();
    try {
      return { body: JSON.parse(text) };
    } catch {
      return {
        errorResponse: Response.json({
          error: "Request body must be valid JSON.",
        }, { status: 400 }),
      };
    }
  }

  private async summarizeWorkflow(
    name: string,
    workflow: Workflow,
    workflowDir: string,
  ) {
    const latest = await this.runs.getLatestRun(name);
    const jobIds = Object.keys(workflow.jobs);
    const triggers = (workflow.on ?? [])
      .map((trigger) => summarizeTrigger(trigger, jobIds))
      .filter((t): t is WorkflowTriggerSummary => t !== undefined);
    const contexts = await Core.Workflows.listWorkflowContexts(workflowDir);
    return {
      id: Core.Workflows.encodeWorkflowId(name),
      name,
      lastStatus: latest?.status,
      lastRunAt: latest?.startedAt,
      triggers,
      contexts,
    };
  }

  async handleListWorkflows(request: Request): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = await Core.Workflows.listWorkflows();
    const workflows = await Promise.all(
      resolved.map(({ name, workflow, workflowDir }) =>
        this.summarizeWorkflow(name, workflow, workflowDir)
      ),
    );

    return Response.json({ workflows } satisfies ListWorkflowsResponse);
  }

  /**
   * GET /v1/workflows/:id — a single workflow's current summary, resyncing it
   * from its git link first (if it has one) so a UI landing on this workflow
   * sees the latest triggers/inputs without waiting for a run. Scoped to just
   * this one workflow rather than the list endpoint syncing every linked
   * workflow up front: cheaper when there are many workflows, and avoids two
   * workflows that share a repo racing on that repo's cache dir (see
   * syncWorkflowFromGit's doc comment).
   */
  async handleGetWorkflow(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      await Core.Workflows.syncWorkflowFromGitLinkIfPresent(
        this.repositories,
        this.links,
        resolved.name,
      );
      const { workflow, workflowDir } = await Core.Workflows.getWorkflowByName(resolved.name);
      const summary = await this.summarizeWorkflow(
        resolved.name,
        workflow,
        workflowDir,
      );
      return Response.json({ workflow: summary } satisfies GetWorkflowResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 404 });
    }
  }

  /**
   * POST /v1/workflows — creates a new workflow. With no `source`, a minimal
   * empty stub workflow.yml (no trigger yet). With `source`, seeds it from a
   * registered repo's own workflows/<pathInRepo> instead, keeping an ongoing
   * link so it auto-resyncs from there on future triggers.
   */
  async handleCreateWorkflow(request: Request): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isCreateWorkflowRequest(parsed.body)) {
      return Response.json({
        error:
          "Expected { name: string, source?: { projectName: string, pathInRepo: string } }.",
      }, { status: 400 });
    }
    const body = parsed.body;

    try {
      const { name, workflow, workflowDir } = await Core.Workflows.createWorkflow(
        this.repositories,
        this.links,
        body.name,
        body.source,
      );
      const summary = await this.summarizeWorkflow(name, workflow, workflowDir);
      return Response.json(
        { workflow: summary } satisfies CreateWorkflowResponse,
      );
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** DELETE /v1/workflows/:id — removes a workflow's directory, any git link it has, and its run history. */
  async handleDeleteWorkflow(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      await Core.Workflows.deleteWorkflow(
        this.repositories,
        this.links,
        this.runs,
        resolved.name,
      );
      return Response.json({ success: true } satisfies DeleteWorkflowResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /** PATCH /v1/workflows/:id — renames a workflow, moving workflows/<name>/ and re-pointing its git link if any. */
  async handleRenameWorkflow(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "upload");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const parsed = await this.parseJsonBody(request);
    if ("errorResponse" in parsed) return parsed.errorResponse;
    if (!isRenameWorkflowRequest(parsed.body)) {
      return Response.json({ error: "Expected { name: string }." }, {
        status: 400,
      });
    }

    try {
      const { name, workflow, workflowDir } = await Core.Workflows.renameWorkflow(
        this.links,
        resolved.name,
        parsed.body.name,
      );
      const summary = await this.summarizeWorkflow(name, workflow, workflowDir);
      return Response.json({ workflow: summary } satisfies RenameWorkflowResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  async handleListRuns(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const runRecords = await this.runs.listRunsForWorkflow(resolved.name);
    return Response.json({ runs: runRecords } satisfies ListRunsResponse);
  }

  async handleListRunSteps(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const runId = params.runId;
    if (!runId) {
      return Response.json({ error: "Missing run id in URL." }, { status: 400 });
    }

    const steps = await this.runs.getRunSteps(runId, resolved.name);
    if (steps === undefined) {
      return Response.json({ error: `Run "${runId}" not found.` }, {
        status: 404,
      });
    }

    const { workflow } = await Core.Workflows.getWorkflowByName(resolved.name);
    const jobs: RunJobNode[] = Object.entries(workflow.jobs).map((
      [id, job],
    ) => ({
      id,
      needs: job.needs ?? [],
    }));

    return Response.json({ steps, jobs } satisfies ListRunStepsResponse);
  }

  async handleGetStepLog(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const runId = params.runId;
    const jobId = params.jobId;
    const index = params.index !== undefined ? Number(params.index) : NaN;
    if (!runId || !jobId || Number.isNaN(index)) {
      return Response.json({
        error: "Missing or invalid run id, job id, or step index in URL.",
      }, { status: 400 });
    }

    const log = await this.runs.getStepLog(runId, jobId, index, resolved.name);
    if (log === undefined) {
      return Response.json({
        error: `No log found for run "${runId}", job "${jobId}", step ${index}.`,
      }, {
        status: 404,
      });
    }
    return Response.json(log satisfies GetStepLogResponse);
  }

  async handleListWorkflowFiles(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      const files = await Core.Workflows.listWorkflowFiles(resolved.name);
      return Response.json({ files } satisfies ListWorkflowFilesResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 404 });
    }
  }

  async handleRunWorkflow(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "trigger");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    try {
      await Core.Workflows.syncWorkflowFromGitLinkIfPresent(
        this.repositories,
        this.links,
        resolved.name,
      );
      const { workflow } = await Core.Workflows.getWorkflowByName(resolved.name);
      await Core.Workflows.assertSelfResolvable(
        workflow,
        resolved.name,
        this.repositories,
        this.links,
      );
      const success = await Core.Workflows.trackedRunWorkflowByName(this.runs, resolved.name, {
        trigger: { type: "manual" },
        repositories: this.repositories,
        links: this.links,
      });
      return Response.json({ success } satisfies RunWorkflowResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }

  /**
   * Deletes a run's record and all of its step logs. Allowed regardless of
   * status — including in_progress — since the only way to clear a run
   * stranded there by a crash/restart is to remove it; this doesn't stop any
   * still-running workflow process, it only removes the tracking record.
   * Gated by "trigger" rather than a dedicated permission, since anything
   * that can start a run is already trusted to mutate run state.
   */
  async handleDeleteRun(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "trigger");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const runId = params.runId;
    if (!runId) {
      return Response.json({ error: "Missing run id in URL." }, { status: 400 });
    }

    const deleted = await this.runs.deleteRun(runId, resolved.name);
    if (!deleted) {
      return Response.json({ error: `Run "${runId}" not found.` }, {
        status: 404,
      });
    }
    return Response.json({ success: true } satisfies DeleteRunResponse);
  }

  async handleReadWorkflowFile(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const path = params["0"];
    if (!path) {
      return Response.json({ error: "Missing file path in URL." }, {
        status: 400,
      });
    }

    try {
      const content = await Core.Workflows.readWorkflowFile(resolved.name, path);
      return Response.json({ content } satisfies ReadWorkflowFileResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 404 });
    }
  }

  /**
   * Exchanges a valid bearer token for a short-lived `ws_token` cookie, so
   * a `WebSocket` connection (which can't set an Authorization header) can
   * still authenticate. The cookie carries the same token, just narrowly
   * scoped (path, short max-age) rather than being a separate credential —
   * see auth/tokens.ts's isAuthorizedFor for the matching read side.
   */
  async handleMintWsToken(request: Request): Promise<Response> {
    // Deliberately checks the header directly, rather than going through
    // isAuthorizedFor (which also accepts the ws_token cookie this endpoint
    // mints) — minting must always start from a real bearer token, never from
    // a cookie re-minting itself.
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) {
      return Response.json({ error: "Missing or invalid bearer token." }, {
        status: 401,
      });
    }
    const token = header.slice("Bearer ".length);
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const response = Response.json({ ok: true } satisfies MintWsTokenResponse);
    setCookie(response.headers, {
      name: WS_TOKEN_COOKIE,
      value: token,
      path: "/v1/workflows",
      maxAge: 60,
      httpOnly: true,
      sameSite: "Strict",
    });
    return response;
  }

  /**
   * Streams live status updates for a single run over WebSocket: job/step
   * state transitions, not log output (logs stay fetched on demand via
   * handleGetStepLog). Pushes an immediate snapshot once the socket opens —
   * closing the race where the run finishes between the dashboard's initial
   * REST fetch and this subscription — then forwards every subsequent update
   * published by trackedRunWorkflow (see core/runs/broadcaster.ts) until the
   * client disconnects.
   */
  async handleRunEvents(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await this.requireAuth(request, "read");
    if (authError) return authError;

    const resolved = resolveWorkflowNameParam(params);
    if ("errorResponse" in resolved) return resolved.errorResponse;

    const runId = params.runId;
    if (!runId) {
      return Response.json({ error: "Missing run id in URL." }, { status: 400 });
    }

    const initial = await this.runs.getRun(runId, resolved.name);
    if (initial === undefined) {
      return Response.json({ error: `Run "${runId}" not found.` }, {
        status: 404,
      });
    }

    const { socket, response } = Deno.upgradeWebSocket(request);
    socket.onopen = () => {
      socket.send(JSON.stringify(initial));
      const unsubscribe = this.runs.subscribe(runId, (record) => {
        socket.send(JSON.stringify(record));
      });
      socket.onclose = unsubscribe;
    };

    return response;
  }
}
