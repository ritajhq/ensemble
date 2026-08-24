import * as Core from "@ensemble/core";
import { isAuthorizedFor } from "../../../auth/tokens.ts";
import { findMatchingGithubTrigger } from "./match.ts";
import {
  isManualTriggerRequest,
  type ManualTriggerResponse,
} from "./manual-contract.ts";

/**
 * Lets the dashboard simulate a GitHub push for a workflow's `on: - github:`
 * trigger, supplying by hand the data a real push webhook would carry (tag,
 * optionally a sha) — for workflows that only care about being pushed to,
 * not about any particular commit actually existing.
 */
export async function handleManual(
  repositories: Core.GitRepositories.GitRepositoryStore,
  links: Core.GitRepositories.WorkflowGitLinkStore,
  runs: Core.Runs.RunStore,
  request: Request,
  params: Record<string, string | undefined>,
): Promise<Response> {
  if (!await isAuthorizedFor(request, "trigger")) {
    return Response.json({ error: "Missing or invalid bearer token." }, {
      status: 401,
    });
  }

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
    await Core.Workflows.syncWorkflowFromGitLinkIfPresent(repositories, links, name);
    ({ workflow } = await Core.Workflows.getWorkflowByName(name));
    await Core.Workflows.assertSelfResolvable(workflow, name, repositories, links);
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
    const success = await Core.Workflows.trackedRunWorkflowByName(runs, name, {
      trigger: {
        type: "github",
        ref: `refs/tags/${body.tag}`,
        tag: body.tag,
        sha: body.sha,
      },
      context: matchedTrigger.context,
      repositories,
      links,
    });
    return Response.json({ success } satisfies ManualTriggerResponse);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }
}
