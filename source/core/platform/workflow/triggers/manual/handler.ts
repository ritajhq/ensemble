import * as Core from "@ensemble/core";
import { requireAuth } from "../../../features.ts";
import {
  extractManualInputs,
  ManualInputError,
  resolveJobInput,
} from "./extract.ts";
import {
  isTriggerRequest,
  type TriggerResponse,
} from "./contract.ts";

/** The store instances the manual trigger's handler is constructed with. */
export interface ManualTriggerStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/** HTTP handler for POST /v1/workflows/:id/trigger, constructor-injected with the stores it operates on. */
export class ManualTriggerHandlers {
  private readonly repositories: Core.GitRepositories.GitRepositoryStore;
  private readonly links: Core.GitRepositories.WorkflowGitLinkStore;
  private readonly runs: Core.Runs.RunStore;

  constructor(stores: ManualTriggerStores) {
    this.repositories = stores.repositories;
    this.links = stores.links;
    this.runs = stores.runs;
  }

  async handle(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<Response> {
    const authError = await requireAuth(request, "trigger");
    if (authError) return authError;

    const id = params.id;
    if (!id) {
      return Response.json({ error: "Missing workflow id in URL." }, {
        status: 400,
      });
    }
    let name: string;
    try {
      name = Core.Workflows.decodeWorkflowId(id);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }

    const text = await request.text();
    let body: unknown = {};
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: "Request body must be valid JSON." }, {
          status: 400,
        });
      }
    }
    if (!isTriggerRequest(body)) {
      return Response.json({
        error:
          "Expected { job?: string | string[], concurrency?: number, variables?: Record<string,string>, context?: string, inputs?: Record<string,unknown> }.",
      }, { status: 400 });
    }

    let workflow;
    try {
      await Core.Workflows.syncWorkflowFromGitLinkIfPresent(this.repositories, this.links, name);
      ({ workflow } = await Core.Workflows.getWorkflowByName(name));
      await Core.Workflows.assertSelfResolvable(workflow, name, this.repositories, this.links);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 404 });
    }

    const manualTrigger = workflow.on?.find((t) => t.manual)?.manual;
    if (!manualTrigger) {
      return Response.json(
        {
          error:
            `Workflow "${name}" has no "manual" trigger declared under "on:".`,
        },
        { status: 403 },
      );
    }

    const declaredInputs = manualTrigger.inputs ?? [];
    let trigger: Record<string, unknown>;
    try {
      trigger = extractManualInputs(
        body.inputs,
        declaredInputs,
        Object.keys(workflow.jobs),
      );
    } catch (error) {
      if (error instanceof ManualInputError) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    trigger.type = "manual";

    try {
      const success = await Core.Workflows.trackedRunWorkflowByName(this.runs, name, {
        job: body.job ?? resolveJobInput(declaredInputs, trigger),
        concurrency: body.concurrency,
        variables: body.variables,
        context: body.context,
        trigger,
        repositories: this.repositories,
        links: this.links,
      });
      return Response.json({ success } satisfies TriggerResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }
}
