import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflowContexts,
  resolveContainerizedSecretsKey,
  runWorkflowByName,
} from "./workflow.ts";
import {
  registerGitRepository,
  syncWorkflowFromGit,
} from "./git-integration.ts";
import {
  GitRepositoryStore,
  WorkflowGitLinkStore,
} from "./git-repositories.ts";

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
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
}

/** See git-integration.test.ts's identical helper doc comment: findRepoRoot() needs the process cwd itself moved into the fixture repoRoot, not just ENSEMBLE_WORKSPACE set. */
async function withContext(
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
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
    const resolved = await createWorkflow(
      ctx.repositories,
      ctx.links,
      "my-workflow",
    );
    assertEquals(resolved.name, "my-workflow");
    assertEquals(resolved.workflow.on, undefined);
    assertEquals(Object.keys(resolved.workflow.jobs).length > 0, true);

    const content = await Deno.readTextFile(
      join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"),
    );
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
    const fixtureDir = await Deno.makeTempDir({
      prefix: "workflow-test-fixture-",
    });
    try {
      await makeFixtureRepo(fixtureDir, {
        "workflows/deploy/workflow.yml":
          "jobs:\n  build:\n    steps:\n      - run: echo hi\n",
      });
      await registerGitRepository(ctx.repositories, {
        repoUrl: fixtureDir,
        projectName: "acme",
      });

      const resolved = await createWorkflow(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        {
          projectName: "acme",
          pathInRepo: "deploy",
        },
      );
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
    const fixtureDir = await Deno.makeTempDir({
      prefix: "workflow-test-fixture-",
    });
    try {
      await makeFixtureRepo(fixtureDir, {
        "workflows/deploy/workflow.yml":
          "jobs:\n  build:\n    steps:\n      - run: echo hi\n",
      });
      await registerGitRepository(ctx.repositories, {
        repoUrl: fixtureDir,
        projectName: "acme",
      });
      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      await deleteWorkflow(ctx.links, "my-workflow");

      const exists = await Deno.stat(
        join(ctx.repoRoot, "workflows", "my-workflow"),
      ).then(() => true).catch(() => false);
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
    const resolved = await createWorkflow(
      ctx.repositories,
      ctx.links,
      "my-workflow",
    );
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "development"), {
      recursive: true,
    });

    assertEquals(await listWorkflowContexts(resolved.workflowDir), [
      "development",
      "production",
    ]);
  });
});

Deno.test("listWorkflowContexts: ignores files directly under contexts/", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(
      ctx.repositories,
      ctx.links,
      "my-workflow",
    );
    await Deno.mkdir(join(resolved.workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(resolved.workflowDir, "contexts", "README.md"),
      "not a context",
    );

    assertEquals(await listWorkflowContexts(resolved.workflowDir), [
      "production",
    ]);
  });
});

Deno.test("listWorkflowContexts: empty (not an error) when there's no contexts/ directory", async () => {
  await withContext(async (ctx) => {
    const resolved = await createWorkflow(
      ctx.repositories,
      ctx.links,
      "my-workflow",
    );
    assertEquals(await listWorkflowContexts(resolved.workflowDir), []);
  });
});

Deno.test("resolveContainerizedSecretsKey: resolves a repo's key via the workflow's git link", async () => {
  await withContext(async (ctx) => {
    await ctx.repositories.put({
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      auth: { type: "none" },
      registeredAt: new Date().toISOString(),
      secretsKey: "the-private-key",
    });
    await ctx.links.put({
      workflowName: "deploy",
      projectName: "widgets",
      pathInRepo: "deploy",
      syncedAt: new Date().toISOString(),
    });

    const key = await resolveContainerizedSecretsKey(
      "deploy",
      ctx.repositories,
      ctx.links,
    );
    assertEquals(key, "the-private-key");
  });
});

Deno.test("resolveContainerizedSecretsKey: undefined when no stores are supplied", async () => {
  const key = await resolveContainerizedSecretsKey(
    "deploy",
    undefined,
    undefined,
  );
  assertEquals(key, undefined);
});

Deno.test("resolveContainerizedSecretsKey: undefined when the workflow has no git link", async () => {
  await withContext(async (ctx) => {
    const key = await resolveContainerizedSecretsKey(
      "local-only",
      ctx.repositories,
      ctx.links,
    );
    assertEquals(key, undefined);
  });
});

Deno.test("resolveContainerizedSecretsKey: undefined when the linked repository is no longer registered", async () => {
  await withContext(async (ctx) => {
    await ctx.links.put({
      workflowName: "deploy",
      projectName: "widgets",
      pathInRepo: "deploy",
      syncedAt: new Date().toISOString(),
    });
    // No matching repositories.put() — the project was removed after linking.
    const key = await resolveContainerizedSecretsKey(
      "deploy",
      ctx.repositories,
      ctx.links,
    );
    assertEquals(key, undefined);
  });
});

Deno.test("resolveContainerizedSecretsKey: undefined when the linked repository has no key configured", async () => {
  await withContext(async (ctx) => {
    await ctx.repositories.put({
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      auth: { type: "none" },
      registeredAt: new Date().toISOString(),
      // no secretsKey
    });
    await ctx.links.put({
      workflowName: "deploy",
      projectName: "widgets",
      pathInRepo: "deploy",
      syncedAt: new Date().toISOString(),
    });

    const key = await resolveContainerizedSecretsKey(
      "deploy",
      ctx.repositories,
      ctx.links,
    );
    assertEquals(key, undefined);
  });
});

Deno.test("resolveContainerizedSecretsKey: different workflows linked to different repos resolve independently", async () => {
  await withContext(async (ctx) => {
    await ctx.repositories.put({
      projectName: "widgets",
      repoUrl: "https://github.com/acme/widgets.git",
      auth: { type: "none" },
      registeredAt: new Date().toISOString(),
      secretsKey: "widgets-key",
    });
    await ctx.repositories.put({
      projectName: "gadgets",
      repoUrl: "https://github.com/acme/gadgets.git",
      auth: { type: "none" },
      registeredAt: new Date().toISOString(),
      secretsKey: "gadgets-key",
    });
    await ctx.links.put({
      workflowName: "deploy-a",
      projectName: "widgets",
      pathInRepo: "deploy",
      syncedAt: new Date().toISOString(),
    });
    await ctx.links.put({
      workflowName: "deploy-b",
      projectName: "gadgets",
      pathInRepo: "deploy",
      syncedAt: new Date().toISOString(),
    });

    assertEquals(
      await resolveContainerizedSecretsKey(
        "deploy-a",
        ctx.repositories,
        ctx.links,
      ),
      "widgets-key",
    );
    assertEquals(
      await resolveContainerizedSecretsKey(
        "deploy-b",
        ctx.repositories,
        ctx.links,
      ),
      "gadgets-key",
    );
  });
});

Deno.test("runWorkflowByName: a containerized run referencing in: { repository: self } fails clearly, before spawning a container", async () => {
  await withContext(async (ctx) => {
    const workflowDir = join(ctx.repoRoot, "workflows", "self-ref");
    await Deno.mkdir(workflowDir, { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "workflow.yml"),
      `jobs:\n  build:\n    in:\n      repository: self\n    steps:\n      - run: echo hi\n`,
    );

    await assertRejects(
      () => runWorkflowByName("self-ref", { containerized: true }),
      Error,
      'declares "in: { repository: self }", which isn\'t yet supported for containerized/server-triggered runs',
    );
  });
});
