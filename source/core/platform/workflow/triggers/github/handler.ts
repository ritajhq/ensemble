import * as Core from "@ensemble/core";
import type { Workflow } from "@ensemble/workflow";
import { requireAuth } from "../../../features.ts";
import { extractTagFromRef, findMatchingGithubTrigger } from "./match.ts";
import { verifyGithubSignature } from "./signature.ts";
import {
  isManualTriggerRequest,
  type ManualTriggerResponse,
} from "./manual-contract.ts";

interface GithubPushPayload {
  ref?: string;
  after?: string;
  repository?: { full_name?: string };
}

function isGithubPushPayload(value: unknown): value is GithubPushPayload {
  return typeof value === "object" && value !== null;
}

/** The store instances the GitHub trigger's handlers are constructed with. */
export interface GithubTriggerStores {
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

/** HTTP handlers for the GitHub push webhook and its dashboard-simulated manual counterpart, constructor-injected with the stores they operate on. */
export class GithubTriggerHandlers {
  private readonly repositories: Core.GitRepositories.GitRepositoryStore;
  private readonly links: Core.GitRepositories.WorkflowGitLinkStore;
  private readonly runs: Core.Runs.RunStore;

  constructor(stores: GithubTriggerStores) {
    this.repositories = stores.repositories;
    this.links = stores.links;
    this.runs = stores.runs;
  }

  /**
   * A single global endpoint, since that's how GitHub webhooks work — one
   * configured URL per repo, not one per ensemble workflow. Identifies which
   * registered repository sent the push (via the payload's own
   * `repository.full_name`) and verifies the signature against that
   * specific repo's own webhookSecret before trusting anything else in the
   * payload — see GitRepositoryRecord.webhookSecret. Fans out: scans every
   * workflow under workflows/ for an `on: - github:` entry whose
   * `push.tags` matches the pushed tag, and triggers all matches.
   */
  async handleWebhook(request: Request): Promise<Response> {
    const rawBody = await request.text();

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, {
        status: 400,
      });
    }

    if (!isGithubPushPayload(payload)) {
      return Response.json({ error: "Expected a GitHub push event payload." }, {
        status: 400,
      });
    }

    // Resolve which registered repository this claims to be from, and
    // verify the signature against THAT repo's own webhookSecret — never a
    // shared/global one. A repo not found, or found but with no
    // webhookSecret configured, gets the same 401 as a bad signature: don't
    // let the response distinguish "unknown repo" from "wrong secret".
    const fullName = payload.repository?.full_name;
    const record = fullName
      ? (await this.repositories.list()).find((r) => Core.GitIntegration.matchesGithubFullName(r.repoUrl, fullName))
      : undefined;

    if (!record?.webhookSecret) {
      return new Response("invalid signature", { status: 401 });
    }

    const valid = await verifyGithubSignature(
      record.webhookSecret,
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );

    if (!valid) return new Response("invalid signature", { status: 401 });

    if (request.headers.get("x-github-event") !== "push") {
      return new Response(null, { status: 204 });
    }

    const tag = payload.ref ? extractTagFromRef(payload.ref) : undefined;

    if (!tag) {
      return new Response(null, { status: 204 }); // not a tag push
    }

    // Best-effort: a resync hiccup (remote unreachable, revoked PAT, ...)
    // shouldn't turn an otherwise-valid, signature-verified push into a 500 —
    // fall through and evaluate against whatever's already on disk from the
    // last successful sync, same as this project's workflows would've been
    // found before this push arrived.
    await Core.Workflows.syncWorkflowGitLinksForProject(this.repositories, this.links, record.projectName)
      .catch((error) => {
        console.error(
          `github-trigger: resync failed for project "${record.projectName}", proceeding with its last-synced content:`,
          error,
        );
      });

    const linkedWorkflows = await this.links.listForProject(record.projectName);

    const matches = (await Promise.all(
      linkedWorkflows.map(async ({ workflowName }) => {
        const { workflow } = await Core.Workflows.getWorkflowByName(workflowName);
        return {
          name: workflowName,
          workflow,
          trigger: findMatchingGithubTrigger(workflow.on, tag),
        };
      }),
    )).filter((
      m,
    ): m is { name: string; workflow: Workflow; trigger: NonNullable<typeof m.trigger> } =>
      m.trigger !== undefined
    );

    try {
      for (const { name, workflow } of matches) {
        await Core.Workflows.assertSelfResolvable(workflow, name, this.repositories, this.links);
      }
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }

    for (const { name, trigger } of matches) {
      Core.Workflows.trackedRunWorkflowByName(this.runs, name, {
        trigger: { type: "github", ref: payload.ref, tag, sha: payload.after },
        context: trigger.context,
        repositories: this.repositories,
        links: this.links,
      }).catch((error) => {
        console.error(
          `workflow "${name}" triggered by github push failed:`,
          error,
        );
      });
    }

    return Response.json({ triggered: matches.map((m) => m.name) }, {
      status: 202,
    });
  }

  /**
   * Lets the dashboard simulate a GitHub push for a workflow's `on: - github:`
   * trigger, supplying by hand the data a real push webhook would carry (tag,
   * optionally a sha) — for workflows that only care about being pushed to,
   * not about any particular commit actually existing.
   */
  async handleManual(
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
    if (!isManualTriggerRequest(body)) {
      return Response.json({ error: "Expected { tag: string, sha?: string }." }, {
        status: 400,
      });
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

    const githubTriggers = workflow.on
      ?.map((t) => t.github)
      .filter((g) => g !== undefined);
    if (!githubTriggers || githubTriggers.length === 0) {
      return Response.json(
        {
          error:
            `Workflow "${name}" has no "github" trigger declared under "on:".`,
        },
        { status: 403 },
      );
    }

    const matchedTrigger = findMatchingGithubTrigger(workflow.on, body.tag);
    if (!matchedTrigger) {
      const patterns = githubTriggers.flatMap((g) => g.push.tags);
      return Response.json(
        {
          error:
            `Tag "${body.tag}" doesn't match any "github" trigger's push.tags patterns (${
              patterns.join(", ")
            }).`,
        },
        { status: 400 },
      );
    }

    try {
      const success = await Core.Workflows.trackedRunWorkflowByName(this.runs, name, {
        trigger: {
          type: "github",
          ref: `refs/tags/${body.tag}`,
          tag: body.tag,
          sha: body.sha,
        },
        context: matchedTrigger.context,
        repositories: this.repositories,
        links: this.links,
      });
      return Response.json({ success } satisfies ManualTriggerResponse);
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : String(error),
      }, { status: 400 });
    }
  }
}
