import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Core from "@ensemble/core";
import { SecretsHandlers } from "./handler.ts";

/** In-memory GitWriteProvider fake — no real GitHub API calls needed to test the handlers' own auth/validation logic. */
function makeFakeGit(): Core.GitWrite.GitWriteProvider & { files: Map<string, Uint8Array> } {
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
    deleteFile(_repoUrl, _auth, path) {
      if (!files.has(path)) return Promise.resolve(undefined);
      files.delete(path);
      return Promise.resolve({ commitSha: "deadbeef" });
    },
  };
}

interface TestContext {
  repoRoot: string;
  repositories: Core.GitRepositories.GitRepositoryStore;
  links: Core.GitRepositories.WorkflowGitLinkStore;
  git: ReturnType<typeof makeFakeGit>;
  handlers: SecretsHandlers;
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
    const repositories = new Core.GitRepositories.GitRepositoryStore(repositoriesKv);
    const links = new Core.GitRepositories.WorkflowGitLinkStore(linksKv);
    const git = makeFakeGit();
    await fn({
      repoRoot,
      repositories,
      links,
      git,
      handlers: new SecretsHandlers({ repositories, links, git }),
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

Deno.test("handleGetContext: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleGetContext(
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

Deno.test("handleGetContext: succeeds (200, empty keys) when the linked repo has a PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleGetContext(
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.keys, []);
    assertEquals(body.files, []);
  });
});

Deno.test("handleSetSecret: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleSetSecret(
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

Deno.test("handleDelete: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleDelete(
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

Deno.test("handleGetContext: 404 when the workflow has no git link at all (distinct from the no-PAT case)", async () => {
  await withContext(async (ctx) => {
    const id = Core.Workflows.encodeWorkflowId("local-only");
    const response = await ctx.handlers.handleGetContext(
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 404);
  });
});

const DEMO_CONF_WORKFLOW_YML = `
jobs:
  demo:
    steps:
      - run: exit 0
context:
  secrets:
    files:
      - name: demo_conf
        path: demo.conf
`;

Deno.test("handleGetContext: lists declared context.secrets.files entries with their set/unset state", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEMO_CONF_WORKFLOW_YML),
    );
    ctx.git.files.set(
      "workflows/deploy/contexts/production/secrets/demo.conf.enc",
      new Uint8Array([1, 2, 3]),
    );

    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleGetContext(
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.files, [{ name: "demo_conf", isSet: true }]);
  });
});

Deno.test("handleGetContext: a declared but unset context.secrets.files entry reports isSet: false", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEMO_CONF_WORKFLOW_YML),
    );

    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleGetContext(
      authedRequest(`http://x/v1/secrets/${id}/production`),
      { workflowId: id, context: "production" },
    );
    const body = await response.json();
    assertEquals(body.files, [{ name: "demo_conf", isSet: false }]);
  });
});

Deno.test("handleSetSecretFile: 400 for a name the workflow doesn't declare under context.secrets.files", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEMO_CONF_WORKFLOW_YML),
    );

    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleSetSecretFile(
      authedRequest(`http://x/v1/secrets/${id}/production/not_declared/set-file`, {
        contentBase64: btoa("hi"),
      }),
      { workflowId: id, context: "production", name: "not_declared" },
    );
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(body.error.includes("not_declared"), true);
  });
});

Deno.test("handleSetSecretFile: 400 with a clear message when the linked repo has no PAT", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "none");
    const id = Core.Workflows.encodeWorkflowId("deploy");
    const response = await ctx.handlers.handleSetSecretFile(
      authedRequest(`http://x/v1/secrets/${id}/production/demo_conf/set-file`, {
        contentBase64: btoa("hi"),
      }),
      { workflowId: id, context: "production", name: "demo_conf" },
    );
    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(
      body.error.includes("write-scoped personal access token"),
      true,
    );
  });
});

Deno.test("handleSetSecretFile: encrypts and commits the declared entry, then handleDeleteFile removes it", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy", "pat");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEMO_CONF_WORKFLOW_YML),
    );
    const { SecretsCrypto } = await import("@ensemble/workflow");
    const { publicKey } = await SecretsCrypto.generateKeypair();
    ctx.git.files.set(
      ".ensemble/secrets.key.pub",
      new TextEncoder().encode(publicKey),
    );

    const id = Core.Workflows.encodeWorkflowId("deploy");
    const setResponse = await ctx.handlers.handleSetSecretFile(
      authedRequest(`http://x/v1/secrets/${id}/production/demo_conf/set-file`, {
        contentBase64: btoa("hello world"),
      }),
      { workflowId: id, context: "production", name: "demo_conf" },
    );
    assertEquals(setResponse.status, 200);
    assertEquals(
      ctx.git.files.has(
        "workflows/deploy/contexts/production/secrets/demo.conf.enc",
      ),
      true,
    );

    const deleteResponse = await ctx.handlers.handleDeleteFile(
      authedRequest(
        `http://x/v1/secrets/${id}/production/demo_conf/delete-file`,
        {},
      ),
      { workflowId: id, context: "production", name: "demo_conf" },
    );
    assertEquals(deleteResponse.status, 200);
    assertEquals(
      ctx.git.files.has(
        "workflows/deploy/contexts/production/secrets/demo.conf.enc",
      ),
      false,
    );
  });
});
