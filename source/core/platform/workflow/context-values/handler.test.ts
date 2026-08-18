import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  encodeWorkflowId,
  GitRepositoryStore,
  type GitWriteProvider,
  WorkflowGitLinkStore,
} from "@ensemble/core";
import { handleGetContextValues } from "./handler.ts";

/** In-memory GitWriteProvider fake — no real GitHub API calls needed to test the handler's own auth/validation logic. */
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
    deleteFile(_repoUrl, _auth, path) {
      if (!files.has(path)) return Promise.resolve(undefined);
      files.delete(path);
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

/** Same pattern as secrets/handler.test.ts: isAuthorizedFor's findRepoRoot() needs the process cwd itself moved into a fixture repoRoot with a real tokens.json, not just an env var. */
async function withContext(
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "context-values-handler-test-",
  });
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

function authedRequest(url: string): Request {
  return new Request(url, {
    method: "GET",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

async function linkWorkflow(
  ctx: TestContext,
  workflowName: string,
): Promise<void> {
  await ctx.repositories.put({
    projectName: "widgets",
    repoUrl: "https://github.com/acme/widgets.git",
    auth: { type: "pat", token: "ghp_x" },
    registeredAt: new Date().toISOString(),
  });
  await ctx.links.put({
    workflowName,
    projectName: "widgets",
    pathInRepo: "deploy",
    syncedAt: new Date().toISOString(),
  });
}

Deno.test("handleGetContextValues: 404 when the workflow has no git link at all", async () => {
  await withContext(async (ctx) => {
    const id = encodeWorkflowId("local-only");
    const response = await handleGetContextValues(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/context-values/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 404);
  });
});

Deno.test("handleGetContextValues: empty variables/files when workflow.yml declares none", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy");
    const id = encodeWorkflowId("deploy");
    const response = await handleGetContextValues(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/context-values/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.variables, []);
    assertEquals(body.files, []);
  });
});

const DEPLOY_WORKFLOW_YML = `
jobs:
  deploy:
    steps:
      - run: exit 0
context:
  variables:
    - name: IMAGE_TAG
    - name: WEB_LIVE_RELOAD
      default: "false"
    - name: IMAGE_REGISTRY
      value: registry.example.com
  files:
    - name: caddy_config
      path: Caddyfile
`;

Deno.test("handleGetContextValues: resolves a variable's value from contexts/<context>/variables.yml", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEPLOY_WORKFLOW_YML),
    );
    ctx.git.files.set(
      "workflows/deploy/contexts/production/variables.yml",
      new TextEncoder().encode("IMAGE_TAG: v1.2.3\n"),
    );

    const id = encodeWorkflowId("deploy");
    const response = await handleGetContextValues(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/context-values/${id}/production`),
      { workflowId: id, context: "production" },
    );
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.variables, [
      { name: "IMAGE_TAG", value: "v1.2.3" },
      { name: "WEB_LIVE_RELOAD", value: "false" },
      { name: "IMAGE_REGISTRY", value: "registry.example.com" },
    ]);
    assertEquals(body.files, [{ name: "caddy_config", path: "Caddyfile" }]);
  });
});

Deno.test("handleGetContextValues: a variable unresolved anywhere (no loader entry, no inline value/default) has no value", async () => {
  await withContext(async (ctx) => {
    await linkWorkflow(ctx, "deploy");
    ctx.git.files.set(
      "workflows/deploy/workflow.yml",
      new TextEncoder().encode(DEPLOY_WORKFLOW_YML),
    );

    const id = encodeWorkflowId("deploy");
    const response = await handleGetContextValues(
      ctx.repositories,
      ctx.links,
      ctx.git,
      authedRequest(`http://x/v1/context-values/${id}/production`),
      { workflowId: id, context: "production" },
    );
    const body = await response.json();
    assertEquals(
      body.variables.find((v: { name: string }) => v.name === "IMAGE_TAG"),
      { name: "IMAGE_TAG" },
    );
  });
});
