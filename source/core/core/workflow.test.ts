import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createWorkflow, deleteWorkflow, listWorkflowContexts } from "./workflow.ts";
import { registerGitRepository, syncWorkflowFromGit } from "./git-integration.ts";
import { GitRepositoryStore, WorkflowGitLinkStore } from "./git-repositories.ts";

async function makeFixtureRepo(dir: string, files: Record<string, string>): Promise<void> {
  await Deno.mkdir(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const filePath = join(dir, rel);
    await Deno.mkdir(join(filePath, ".."), { recursive: true });
    await Deno.writeTextFile(filePath, content);
  }
  const run = async (args: string[]) => {
    const { success } = await new Deno.Command("git", { args, cwd: dir }).output();
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
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
}

/** See git-integration.test.ts's identical helper doc comment: findRepoRoot() needs the process cwd itself moved into the fixture repoRoot, not just ENSEMBLE_WORKSPACE set. */
async function withContext(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "workflow-test-repo-" });
  const repositoriesKv = await Deno.openKv(":memory:");
  const linksKv = await Deno.openKv(":memory:");
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await Deno.mkdir(join(repoRoot, "workflows"), { recursive: true });
    Deno.chdir(repoRoot);
    await fn({
      repoRoot,
      repositories: new GitRepositoryStore(repositoriesKv),
      links: new WorkflowGitLinkStore(linksKv),
    });
  } finally {
    Deno.chdir(previousCwd);
    repositoriesKv.close();
    linksKv.close();
    await Deno.remove(repoRoot, { recursive: true }).catch(() => {});
  }
}

Deno.test("createWorkflow: writes a minimal stub with no trigger", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(ctx.repositories, ctx.links, "my-workflow");
    assertEquals(resolved.name, "my-workflow");
    assertEquals(resolved.workflow.on, undefined);
    assertEquals(Object.keys(resolved.workflow.jobs).length > 0, true);

    const content = await Deno.readTextFile(join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"));
    assertEquals(content.includes("jobs:"), true);
  });
});

Deno.test("createWorkflow: rejects an invalid name", async () => {
  await withContext(async (ctx) => {
    await assertRejects(
      () => createWorkflow(ctx.repositories, ctx.links, "-bad-name"),
      Error,
      "Invalid workflow name",
    );
  });
});

Deno.test("createWorkflow: throws if a workflow already exists at that name", async () => {
  await withContext(async (ctx) => {
    await createWorkflow(ctx.repositories, ctx.links, "my-workflow");
    await assertRejects(
      () => createWorkflow(ctx.repositories, ctx.links, "my-workflow"),
      Error,
      "already exists",
    );
  });
});

Deno.test("createWorkflow: with a git source, seeds content from the repo and records the link", async () => {
  await withContext(async (ctx) => {
    const fixtureDir = await Deno.makeTempDir({ prefix: "workflow-test-fixture-" });
    try {
      await makeFixtureRepo(fixtureDir, {
        "workflows/deploy/workflow.yml": "jobs:\n  build:\n    steps:\n      - run: echo hi\n",
      });
      await registerGitRepository(ctx.repositories, { repoUrl: fixtureDir, projectName: "acme" });

      const resolved = await createWorkflow(ctx.repositories, ctx.links, "my-workflow", {
        projectName: "acme",
        pathInRepo: "deploy",
      });
      assertEquals(resolved.name, "my-workflow");

      const link = await ctx.links.get("my-workflow");
      assertEquals(link?.projectName, "acme");
      assertEquals(link?.pathInRepo, "deploy");
    } finally {
      await Deno.remove(fixtureDir, { recursive: true }).catch(() => {});
    }
  });
});

Deno.test("deleteWorkflow: removes the directory and any git link", async () => {
  await withContext(async (ctx) => {
    const fixtureDir = await Deno.makeTempDir({ prefix: "workflow-test-fixture-" });
    try {
      await makeFixtureRepo(fixtureDir, {
        "workflows/deploy/workflow.yml": "jobs:\n  build:\n    steps:\n      - run: echo hi\n",
      });
      await registerGitRepository(ctx.repositories, { repoUrl: fixtureDir, projectName: "acme" });
      await syncWorkflowFromGit(ctx.repositories, ctx.links, "my-workflow", "acme", "deploy");

      await deleteWorkflow(ctx.links, "my-workflow");

      const exists = await Deno.stat(join(ctx.repoRoot, "workflows", "my-workflow")).then(() => true).catch(() => false);
      assertEquals(exists, false);
      assertEquals(await ctx.links.get("my-workflow"), undefined);
    } finally {
      await Deno.remove(fixtureDir, { recursive: true }).catch(() => {});
    }
  });
});

Deno.test("deleteWorkflow: is a no-op (not an error) when the workflow doesn't exist", async () => {
  await withContext(async (ctx) => {
    await deleteWorkflow(ctx.links, "nonexistent");
  });
});

Deno.test("listWorkflowContexts: returns one name per contexts/ subdirectory, sorted", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(ctx.repositories, ctx.links, "my-workflow");
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "production"), { recursive: true });
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "development"), { recursive: true });

    assertEquals(await listWorkflowContexts(resolved.workflowDir), ["development", "production"]);
  });
});

Deno.test("listWorkflowContexts: ignores files directly under contexts/", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(ctx.repositories, ctx.links, "my-workflow");
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(resolved.workflowDir, "contexts", "README.md"), "not a context");

    assertEquals(await listWorkflowContexts(resolved.workflowDir), ["production"]);
  });
});

Deno.test("listWorkflowContexts: empty (not an error) when there's no contexts/ directory", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(ctx.repositories, ctx.links, "my-workflow");
    assertEquals(await listWorkflowContexts(resolved.workflowDir), []);
  });
});
