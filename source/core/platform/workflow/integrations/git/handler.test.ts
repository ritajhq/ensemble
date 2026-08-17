import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import {
  GitRepositoryStore,
  registerGitRepository,
} from "@ensemble/core";
import { handleSetRepositoryAuth } from "./handler.ts";

async function makeFixtureRepo(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  await Deno.mkdir(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const filePath = join(dir, rel);
    await Deno.mkdir(join(filePath, ".."), { recursive: true });
    await Deno.writeTextFile(filePath, content);
  }
  const run = async (args: string[]) => {
    const { success } = await new Deno.Command("git", { args, cwd: dir })
      .output();
    if (!success) throw new Error(`git ${args.join(" ")} failed`);
  };
  await run(["init", "-q", "-b", "main"]);
  await run(["config", "user.email", "test@example.com"]);
  await run(["config", "user.name", "Test"]);
  await run(["add", "."]);
  await run(["commit", "-q", "-m", "initial"]);
}

interface TestContext {
  repoRoot: string;
  fixtureDir: string;
  repositories: GitRepositoryStore;
}

const TOKEN = "test-token";

/** Same pattern as secrets/handler.test.ts: isAuthorizedFor's findRepoRoot() needs the process cwd itself moved into a fixture repoRoot with a real tokens.json. */
async function withContext(
  files: Record<string, string>,
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "git-integration-handler-test-",
  });
  const fixtureDir = await Deno.makeTempDir({
    prefix: "git-integration-handler-fixture-",
  });
  const repositoriesKv = await Deno.openKv(":memory:");
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble", "platform"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "platform", "tokens.json"),
      JSON.stringify({ [TOKEN]: { read: true, upload: true } }),
    );
    await makeFixtureRepo(fixtureDir, files);
    Deno.chdir(repoRoot);
    await fn({
      repoRoot,
      fixtureDir,
      repositories: new GitRepositoryStore(repositoriesKv),
    });
  } finally {
    Deno.chdir(previousCwd);
    repositoriesKv.close();
    await Deno.remove(repoRoot, { recursive: true }).catch(() => {});
    await Deno.remove(fixtureDir, { recursive: true }).catch(() => {});
  }
}

function authedRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const SIMPLE_WORKFLOW_YML = `
jobs:
  build:
    steps:
      - run: echo hi
`;

Deno.test("handleSetRepositoryAuth: updates auth and reports the new authType", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      const response = await handleSetRepositoryAuth(
        ctx.repositories,
        authedRequest("http://x/v1/integrations/git/repositories/acme/auth", {
          auth: { type: "pat", token: "ghp_x" },
        }),
        { projectName: "acme" },
      );
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body, { projectName: "acme", authType: "pat" });

      const record = await ctx.repositories.get("acme");
      assertEquals(record?.auth, { type: "pat", token: "ghp_x" });
    },
  );
});

Deno.test("handleSetRepositoryAuth: 400 for an unregistered project", async () => {
  await withContext({ "README.md": "unused" }, async (ctx) => {
    const response = await handleSetRepositoryAuth(
      ctx.repositories,
      authedRequest(
        "http://x/v1/integrations/git/repositories/nonexistent/auth",
        { auth: { type: "none" } },
      ),
      { projectName: "nonexistent" },
    );
    assertEquals(response.status, 400);
  });
});

Deno.test("handleSetRepositoryAuth: 400 on a malformed request body", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      const response = await handleSetRepositoryAuth(
        ctx.repositories,
        authedRequest("http://x/v1/integrations/git/repositories/acme/auth", {
          auth: { type: "pat" },
        }),
        { projectName: "acme" },
      );
      assertEquals(response.status, 400);
    },
  );
});

Deno.test("handleSetRepositoryAuth: 401 without a bearer token", async () => {
  await withContext({ "README.md": "unused" }, async (ctx) => {
    const response = await handleSetRepositoryAuth(
      ctx.repositories,
      new Request("http://x/v1/integrations/git/repositories/acme/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ auth: { type: "none" } }),
      }),
      { projectName: "acme" },
    );
    assertEquals(response.status, 401);
  });
});
