import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  encodeWorkflowId,
  GitRepositoryStore,
  type GitWriteProvider,
  WorkflowGitLinkStore,
} from "@ensemble/core";
import {
  handleDeleteSecret,
  handleGetSecretsContext,
  handleSetSecret,
} from "./handler.ts";

/** In-memory GitWriteProvider fake — no real GitHub API calls needed to test the handlers' own auth/validation logic. */
function makeFakeGit(): GitWriteProvider & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    getFile(_repoUrl, _auth, path) {
      return Promise.resolve(files.get(path));
    },
    putFile(_repoUrl, _auth, path, content) {
      files.set(path, content);
      return Promise.resolve({ commitSha: "deadbeef" });
    },
  };
}

interface TestContext {
  repoRoot: string;
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
  git: ReturnType<typeof makeFakeGit>;
}

const TOKEN = "test-token";

/** Same pattern as git-integration.test.ts/workflow.test.ts: isAuthorizedFor's findRepoRoot() needs the process cwd itself moved into a fixture repoRoot with a real tokens.json, not just an env var. */
async function withContext(
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "secrets-handler-test-" });
  const repositoriesKv = await Deno.openKv(":memory:");
  const linksKv = await Deno.openKv(":memory:");
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "platform"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "platform", "tokens.json"),
      JSON.stringify({ [TOKEN]: { read: true, upload: true } }),
    );
    Deno.chdir(repoRoot);
    await fn({
      repoRoot,
      repositories: new GitRepositoryStore(repositoriesKv),
      links: new WorkflowGitLinkStore(linksKv),
      git: makeFakeGit(),
    });
  } finally {
    Deno.chdir(previousCwd);
    repositoriesKv.close();
    linksKv.close();
    await Deno.remove(repoRoot, { recursive: true }).catch(() => {});
  }
}

function authedRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function linkWorkflow(
  ctx: TestContext,
  workflowName: string,
  authType: "none" | "pat",
): Promise<void> {
  await ctx.repositories.put({
    projectName: "widgets",
    repoUrl: "https://github.com/acme/widgets.git",
    auth: authType === "pat"
      ? { type: "pat", token: "ghp_x" }
      : { type: "none" },
    registeredAt: new Date().toISOString(),
  });
  await ctx.links.put({
    workflowName,
    projectName: "widgets",
    pathInRepo: "deploy",
    syncedAt: new Date().toISOString(),
  });
}

Deno.test("handleGetSecretsContext: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = encodeWorkflowId("deploy");
    const response = await handleGetSecretsContext(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(
      body.error.includes("write-scoped personal access token"),
      true,
    );
  });
});

Deno.test("handleGetSecretsContext: succeeds (200, empty keys) when the linked repo has a PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    const id = encodeWorkflowId("deploy");
    const response = await handleGetSecretsContext(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.keys, []);
  });
});

Deno.test("handleSetSecret: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = encodeWorkflowId("deploy");
    const response = await handleSetSecret(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/secrets/${id}/production/DB_PASSWORD/set`, {
        value: "hunter2",
      }),
      { workflowId: id, context: "production", key: "DB_PASSWORD" },
    );
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(
      body.error.includes("write-scoped personal access token"),
      true,
    );
  });
});

Deno.test("handleDeleteSecret: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = encodeWorkflowId("deploy");
    const response = await handleDeleteSecret(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(
        `http://x/v1/secrets/${id}/production/DB_PASSWORD/delete`,
        {},
      ),
      { workflowId: id, context: "production", key: "DB_PASSWORD" },
    );
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(
      body.error.includes("write-scoped personal access token"),
      true,
    );
  });
});

Deno.test("handleGetSecretsContext: 404 when the workflow has no git link at all (distinct from the no-PAT case)", async () => {
  await withContext(async (ctx) => {
    const id = encodeWorkflowId("local-only");
    const response = await handleGetSecretsContext(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 404);
  });
});
