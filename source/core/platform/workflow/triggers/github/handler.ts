import { listWorkflows, runWorkflowByName } from "@ensemble/core";
import { extractTagFromRef, matchesAnyTagPattern } from "./match.ts";
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
 * `event.push.tags` matches the pushed tag, and triggers all matches.
 */
export async function handleGithubTrigger(request: Request): Promise<Response> {
  const rawBody = await request.text();

  const secret = Deno.env.get("GITHUB_WEBHOOK_SECRET");
  if (secret) {
    const valid = await verifyGithubSignature(secret, rawBody, request.headers.get("x-hub-signature-256"));
    if (!valid) return new Response("invalid signature", { status: 401 });
  }

  if (request.headers.get("x-github-event") !== "push") {
    return new Response(null, { status: 204 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isGithubPushPayload(payload)) {
    return Response.json({ error: "Expected a GitHub push event payload." }, { status: 400 });
  }

  const tag = payload.ref ? extractTagFromRef(payload.ref) : undefined;
  if (!tag) {
    return new Response(null, { status: 204 }); // not a tag push
  }

  const workflows = await listWorkflows();
  const matches = workflows.filter(({ workflow }) => {
    const githubTrigger = workflow.on?.find((t) => t.github)?.github;
    return githubTrigger !== undefined && matchesAnyTagPattern(tag, githubTrigger.event.push.tags);
  });

  for (const { name } of matches) {
    runWorkflowByName(name, {
      trigger: { ref: payload.ref, tag, sha: payload.after },
    }).catch((error) => {
      console.error(`workflow "${name}" triggered by github push failed:`, error);
    });
  }

  return Response.json({ triggered: matches.map((m) => m.name) }, { status: 202 });
}
