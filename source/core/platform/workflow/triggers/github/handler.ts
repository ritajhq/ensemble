import {
  assertSelfResolvable,
  type GitRepositoryStore,
  listWorkflows,
  type RunStore,
  syncAllWorkflowGitLinks,
  trackedRunWorkflowByName,
  type WorkflowGitLinkStore,
} from "@ensemble/core";
import type { Workflow } from "@ensemble/workflow";
import { extractTagFromRef, findMatchingGithubTrigger } from "./match.ts";
import { verifyGithubSignature } from "./signature.ts";

interface GithubPushPayload {
  ref?: string;
  after?: string;
}

function isGithubPushPayload(value: unknown): value is GithubPushPayload {
  return typeof value === "object" && value !== null;
}

/**
 * A single global endpoint, since that's how GitHub webhooks work — one
 * configured URL per repo, not one per ensemble workflow. Fans out: scans
 * every workflow under workflows/ for an `on: - github:` entry whose
 * `push.tags` matches the pushed tag, and triggers all matches.
 */
export async function handleGithubTrigger(
  repositories: GitRepositoryStore,
  links: WorkflowGitLinkStore,
  runs: RunStore,
  request: Request,
): Promise<Response> {
  const rawBody = await request.text();

  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");

  if (!secret) {
    console.error(
      "github-trigger: rejecting request — GITHUB_WEBHOOK_SECRET is not configured.",
    );

    return new Response("github trigger is not configured", { status: 401 });
  }

  const valid = await verifyGithubSignature(
    secret,
    rawBody,
    request.headers.get("x-hub-signature-256"),
  );

  if (!valid) return new Response("invalid signature", { status: 401 });

  if (request.headers.get("x-github-event") !== "push") {
    return new Response(null, { status: 204 });
  }

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

  const tag = payload.ref ? extractTagFromRef(payload.ref) : undefined;

  if (!tag) {
    return new Response(null, { status: 204 }); // not a tag push
  }

  await syncAllWorkflowGitLinks(repositories, links);

  const workflows = await listWorkflows();

  const matches = workflows
    .map(({ name, workflow }) => ({
      name,
      workflow,
      trigger: findMatchingGithubTrigger(workflow.on, tag),
    }))
    .filter((
      m,
    ): m is { name: string; workflow: Workflow; trigger: NonNullable<typeof m.trigger> } =>
      m.trigger !== undefined
    );

  try {
    for (const { name, workflow } of matches) {
      await assertSelfResolvable(workflow, name, repositories, links);
    }
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 400 });
  }

  for (const { name, trigger } of matches) {
    trackedRunWorkflowByName(runs, name, {
      trigger: { type: "github", ref: payload.ref, tag, sha: payload.after },
      context: trigger.context,
      repositories,
      links,
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
