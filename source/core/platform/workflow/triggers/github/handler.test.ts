import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Core from "@ensemble/core";
import { handle as handleGithubTrigger } from "./handler.ts";

interface TestContext {
  repoRoot: string;
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  runs: Core.Runs.RunStore;
}

const SIMPLE_WORKFLOW_YML = `
on:
  - github:
      push:
        tags: ["*.*.*"]
jobs:
  build:
    steps:
      - run: echo hi
`;

/** Same pattern as integrations/git/handler.test.ts: findRepoRoot() needs the process cwd itself moved into a fixture repoRoot. */
async function withContext(
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "github-trigger-handler-test-",
  });
  const repositoriesKv = await Deno.openKv(":memory:");
  const linksKv = await Deno.openKv(":memory:");
  const runsKv = await Deno.openKv(":memory:");
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "platform"), {
      recursive: true,
    });
    Deno.chdir(repoRoot);
    await fn({
      repoRoot,
      repositories: new Core.GitRepositories.GitRepositoryStore(repositoriesKv),
      links: new Core.GitRepositories.WorkflowGitLinkStore(linksKv),
      runs: new Core.Runs.RunStore(runsKv),
    });
  } finally {
    Deno.chdir(previousCwd);
    repositoriesKv.close();
    linksKv.close();
    runsKv.close();
    await Deno.remove(repoRoot, { recursive: true }).catch(() => {});
  }
}

async function registerRepoWithLinkedWorkflow(
  ctx: TestContext,
  options: {
    projectName: string;
    repoUrl: string;
    webhookSecret?: string;
    workflowName: string;
    workflowYml?: string;
  },
): Promise<void> {
  await ctx.repositories.put({
    projectName: options.projectName,
    repoUrl: options.repoUrl,
    auth: { type: "none" },
    registeredAt: new Date().toISOString(),
    webhookSecret: options.webhookSecret,
  });
  await ctx.links.put({
    workflowName: options.workflowName,
    projectName: options.projectName,
    pathInRepo: options.workflowName,
    syncedAt: new Date().toISOString(),
  });
  const workflowDir = join(ctx.repoRoot, "workflows", options.workflowName);
  await Deno.mkdir(workflowDir, { recursive: true });
  await Deno.writeTextFile(
    join(workflowDir, "workflow.yml"),
    options.workflowYml ?? SIMPLE_WORKFLOW_YML,
  );
}

async function computeSignature(secret: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

function pushPayload(fullName: string, tag: string): string {
  return JSON.stringify({
    ref: `refs/tags/${tag}`,
    after: "deadbeef",
    repository: { full_name: fullName },
  });
}

async function signedRequest(
  secret: string,
  body: string,
  event = "push",
): Promise<Request> {
  return new Request("https://example.com/v1/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": await computeSignature(secret, body),
    },
    body,
  });
}

Deno.test("handleGithubTrigger: triggers the one workflow linked to the repository that signed the payload", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "shh",
      workflowName: "deploy",
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("shh", body),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), { triggered: ["deploy"] });
  });
});

Deno.test("handleGithubTrigger: rejects an unregistered repository with 401, same as an invalid signature", async () => {
  await withContext(async (ctx) => {
    const body = pushPayload("acme/nonexistent", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("whatever-secret", body),
    );
    assertEquals(response.status, 401);
  });
});

Deno.test("handleGithubTrigger: rejects a registered repository with no webhookSecret configured", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      // webhookSecret intentionally omitted
      workflowName: "deploy",
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("some-guess", body),
    );
    assertEquals(response.status, 401);
  });
});

Deno.test("handleGithubTrigger: rejects a signature computed with a different repository's secret", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "widgets-secret",
      workflowName: "deploy",
    });
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "gadgets",
      repoUrl: "https://github.com/acme/gadgets.git",
      webhookSecret: "gadgets-secret",
      workflowName: "gadgets-deploy",
    });

    // Payload claims to be from "widgets", but is signed with "gadgets"'s secret.
    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("gadgets-secret", body),
    );
    assertEquals(response.status, 401);
  });
});

Deno.test("handleGithubTrigger: a push for one registered repo never triggers a workflow linked to a different one", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "widgets-secret",
      workflowName: "widgets-deploy",
    });
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "gadgets",
      repoUrl: "https://github.com/acme/gadgets.git",
      webhookSecret: "gadgets-secret",
      workflowName: "gadgets-deploy",
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("widgets-secret", body),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), { triggered: ["widgets-deploy"] });
  });
});

Deno.test("handleGithubTrigger: a non-push event is a 204 no-op even for a fully valid signature", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "shh",
      workflowName: "deploy",
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("shh", body, "ping"),
    );
    assertEquals(response.status, 204);
  });
});

Deno.test("handleGithubTrigger: a branch push (not a tag) is a 204 no-op", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "shh",
      workflowName: "deploy",
    });

    const body = JSON.stringify({
      ref: "refs/heads/main",
      after: "deadbeef",
      repository: { full_name: "acme/widgets" },
    });
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("shh", body),
    );
    assertEquals(response.status, 204);
  });
});

Deno.test("handleGithubTrigger: a tag that doesn't match the linked workflow's push.tags pattern triggers nothing", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      webhookSecret: "shh",
      workflowName: "deploy",
      workflowYml: `
on:
  - github:
      push:
        tags: ["2.*"]
jobs:
  build:
    steps:
      - run: echo hi
`,
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("shh", body),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), { triggered: [] });
  });
});

Deno.test("handleGithubTrigger: matches a registered repository regardless of a .git suffix on its stored repoUrl", async () => {
  await withContext(async (ctx) => {
    await registerRepoWithLinkedWorkflow(ctx, {
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets",
      webhookSecret: "shh",
      workflowName: "deploy",
    });

    const body = pushPayload("acme/widgets", "1.2.3");
    const response = await handleGithubTrigger(
      ctx.repositories,
      ctx.links,
      ctx.runs,
      await signedRequest("shh", body),
    );

    assertEquals(response.status, 202);
    assertEquals(await response.json(), { triggered: ["deploy"] });
  });
});
