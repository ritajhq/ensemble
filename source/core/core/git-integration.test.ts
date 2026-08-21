import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  listRepoWorkflowCandidates,
  registerGitRepository,
  removeGitRepository,
  setRepositoryAuth,
  setRepositorySecretsKey,
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
  fixtureDir: string;
  repositories: GitRepositoryStore;
  links: WorkflowGitLinkStore;
}

/**
 * findRepoRoot() walks up from Deno.cwd() looking for a real `.ensemble`
 * marker dir before ever consulting ENSEMBLE_WORKSPACE — and `deno test`'s
 * cwd is this very repo's own root, which has a real `.ensemble` dir. So
 * setting ENSEMBLE_WORKSPACE alone doesn't shadow it; the test process's cwd
 * has to actually move into the fixture repoRoot for the duration of the
 * test (restored after), same as a real `cd` into a fresh checkout would.
 */
async function withContext(
  files: Record<string, string>,
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "git-integration-repo-" });
  const fixtureDir = await Deno.makeTempDir({
    prefix: "git-integration-fixture-",
  });
  const repositoriesKv = await Deno.openKv(":memory:");
  const linksKv = await Deno.openKv(":memory:");
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await Deno.mkdir(join(repoRoot, "workflows"), { recursive: true });
    await makeFixtureRepo(fixtureDir, files);
    Deno.chdir(repoRoot);
    await fn({
      repoRoot,
      fixtureDir,
      repositories: new GitRepositoryStore(repositoriesKv),
      links: new WorkflowGitLinkStore(linksKv),
    });
  } finally {
    Deno.chdir(previousCwd);
    repositoriesKv.close();
    linksKv.close();
    await Deno.remove(repoRoot, { recursive: true }).catch(() => {});
    await Deno.remove(fixtureDir, { recursive: true }).catch(() => {});
  }
}

const SIMPLE_WORKFLOW_YML = `
jobs:
  build:
    steps:
      - run: echo hi
`;

Deno.test("registerGitRepository: validates access and persists a record without touching workflows/", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const record = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      assertEquals(record.projectName, "acme");
      assertEquals(record.auth, { type: "none" });
      assertEquals(await ctx.repositories.get("acme"), record);

      const workflowsEntries = [
        ...Deno.readDirSync(join(ctx.repoRoot, "workflows")),
      ];
      assertEquals(workflowsEntries.length, 0);
    },
  );
});

Deno.test("registerGitRepository: derives the project name from the repo URL when omitted", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const record = await registerGitRepository(ctx.repositories, {
        repoUrl: `${ctx.fixtureDir}/`,
      });
      const expectedName = ctx.fixtureDir.split("/").pop();
      assertEquals(record.projectName, expectedName);
    },
  );
});

Deno.test("registerGitRepository: persists an optional secretsKey", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const record = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
        secretsKey: "the-private-key",
      });
      assertEquals(record.secretsKey, "the-private-key");
      assertEquals(
        (await ctx.repositories.get("acme"))?.secretsKey,
        "the-private-key",
      );
    },
  );
});

Deno.test("registerGitRepository: secretsKey is absent when omitted", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const record = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      assertEquals(record.secretsKey, undefined);
    },
  );
});

Deno.test("setRepositorySecretsKey: sets a key on an already-registered repository without touching its other fields", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const original = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      const updated = await setRepositorySecretsKey(
        ctx.repositories,
        "acme",
        "rotated-key",
      );
      assertEquals(updated.secretsKey, "rotated-key");
      assertEquals(updated.repoUrl, original.repoUrl);
      assertEquals(updated.registeredAt, original.registeredAt);
    },
  );
});

Deno.test("setRepositorySecretsKey: throws for an unregistered project", async () => {
  await withContext({ "README.md": "unused" }, async (ctx) => {
    await assertRejects(
      () => setRepositorySecretsKey(ctx.repositories, "nonexistent", "key"),
      Error,
      "not registered",
    );
  });
});

Deno.test("setRepositoryAuth: updates auth on an already-registered repository without touching its other fields", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const original = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
        secretsKey: "existing-key",
      });
      const updated = await setRepositoryAuth(
        ctx.repositories,
        "acme",
        { type: "pat", token: "ghp_rotated" },
      );
      assertEquals(updated.auth, { type: "pat", token: "ghp_rotated" });
      assertEquals(updated.repoUrl, original.repoUrl);
      assertEquals(updated.registeredAt, original.registeredAt);
      assertEquals(updated.secretsKey, "existing-key");
    },
  );
});

Deno.test("setRepositoryAuth: throws for an unregistered project", async () => {
  await withContext({ "README.md": "unused" }, async (ctx) => {
    await assertRejects(
      () => setRepositoryAuth(ctx.repositories, "nonexistent", { type: "none" }),
      Error,
      "not registered",
    );
  });
});

Deno.test("setRepositoryAuth: re-validates access, throwing (and not persisting) if the repo can no longer be cloned", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      const original = await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      // Simulates the repo becoming unreachable after registration (e.g.
      // deleted, or a PAT that no longer has access) — setRepositoryAuth
      // re-clones the stored repoUrl before persisting, same as
      // registration itself does.
      await Deno.remove(ctx.fixtureDir, { recursive: true });
      await assertRejects(
        () => setRepositoryAuth(ctx.repositories, "acme", { type: "none" }),
        Error,
      );
      const stillOriginal = await ctx.repositories.get("acme");
      assertEquals(stillOriginal?.auth, original.auth);
    },
  );
});

Deno.test("registerGitRepository: an invalid PAT against a real HTTPS remote surfaces a clear error, not git's raw 'could not read Username' text", async () => {
  // Real network call, like git-write.test.ts's own PAT-rejection tests —
  // a genuinely bad token against a real public repo always fails the same
  // way, so this isn't flaky. Reproduces the actual bug report: in an
  // environment with no git credential helper configured (true of the
  // server's own container — no ~/.gitconfig), GitHub rejecting a bad PAT
  // makes git fall through to an interactive username prompt instead of a
  // clean 401, surfacing as "could not read Username ... No such device or
  // address" — meaningless to anyone who doesn't already know git's
  // internals. registerGitRepository/setRepositoryAuth's shared clone path
  // (sparseCloneWorkflows) should reword that into something actionable.
  await withContext({ "README.md": "unused" }, async (ctx) => {
    const error = await assertRejects(
      () =>
        registerGitRepository(ctx.repositories, {
          repoUrl: "https://github.com/octocat/Spoon-Knife",
          projectName: "spoon-knife",
          auth: { type: "pat", token: "ghp_definitely_invalid_test_token" },
        }),
      Error,
    );
    assertEquals(
      error.message.includes("GitHub rejected the personal access token"),
      true,
    );
  });
});

Deno.test("registerGitRepository: throws when the repo has no workflows/ folder", async () => {
  await withContext({ "README.md": "hi" }, async (ctx) => {
    await assertRejects(
      () =>
        registerGitRepository(ctx.repositories, {
          repoUrl: ctx.fixtureDir,
          projectName: "acme",
        }),
      Error,
      "workflows/",
    );
  });
});

Deno.test("listRepoWorkflowCandidates: lists every workflow.yml found, flagging trigger presence", async () => {
  await withContext({
    "workflows/deploy/workflow.yml": `
on:
  - manual: {}
jobs:
  build:
    steps:
      - run: echo hi
`,
    "workflows/local-only/workflow.yml": SIMPLE_WORKFLOW_YML,
  }, async (ctx) => {
    await registerGitRepository(ctx.repositories, {
      repoUrl: ctx.fixtureDir,
      projectName: "acme",
    });
    const candidates = await listRepoWorkflowCandidates(
      ctx.repositories,
      "acme",
    );
    const byPath = Object.fromEntries(
      candidates.map((c) => [c.pathInRepo, c.hasTrigger]),
    );
    assertEquals(byPath, { deploy: true, "local-only": false });
  });
});

Deno.test("listRepoWorkflowCandidates: throws for an unregistered project", async () => {
  await withContext({ "README.md": "unused" }, async (ctx) => {
    await assertRejects(
      () => listRepoWorkflowCandidates(ctx.repositories, "nonexistent"),
      Error,
      "not registered",
    );
  });
});

Deno.test("syncWorkflowFromGit: copies content into workflows/<name> and records the link", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      const content = await Deno.readTextFile(
        join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"),
      );
      assertEquals(content, SIMPLE_WORKFLOW_YML);

      const link = await ctx.links.get("my-workflow");
      assertEquals(link?.projectName, "acme");
      assertEquals(link?.pathInRepo, "deploy");
    },
  );
});

Deno.test("syncWorkflowFromGit: throws (and doesn't touch the live dir) when the candidate path has no workflow.yml", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await assertRejects(
        () =>
          syncWorkflowFromGit(
            ctx.repositories,
            ctx.links,
            "my-workflow",
            "acme",
            "nonexistent",
          ),
        Error,
        "workflow.yml",
      );

      const exists = await Deno.stat(
        join(ctx.repoRoot, "workflows", "my-workflow"),
      ).then(() => true).catch(() => false);
      assertEquals(exists, false);
    },
  );
});

Deno.test("syncWorkflowFromGit: throws for an invalid workflow.yml without touching the live dir", async () => {
  await withContext(
    { "workflows/broken/workflow.yml": "not: [valid" },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await assertRejects(() =>
        syncWorkflowFromGit(
          ctx.repositories,
          ctx.links,
          "my-workflow",
          "acme",
          "broken",
        )
      );

      const exists = await Deno.stat(
        join(ctx.repoRoot, "workflows", "my-workflow"),
      ).then(() => true).catch(() => false);
      assertEquals(exists, false);
    },
  );
});

Deno.test("syncWorkflowFromGit: a second sync with the remote unchanged skips re-cloning (cache dir's mtime is untouched)", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );
      const recordAfterFirstSync = await ctx.repositories.get("acme");
      assertEquals(typeof recordAfterFirstSync?.lastFetchedSha, "string");

      const cacheDir = join(
        ctx.repoRoot,
        ".ensemble",
        "platform",
        "git-repos",
        "acme",
      );
      const mtimeBefore = (await Deno.stat(cacheDir)).mtime;

      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      // A real re-clone deletes and recreates this directory (see
      // refreshRepoCache), which would bump its mtime — unchanged mtime
      // proves the clone was skipped since the remote SHA hadn't moved.
      const mtimeAfter = (await Deno.stat(cacheDir)).mtime;
      assertEquals(mtimeAfter?.getTime(), mtimeBefore?.getTime());

      const content = await Deno.readTextFile(
        join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"),
      );
      assertEquals(content, SIMPLE_WORKFLOW_YML);
    },
  );
});

Deno.test("syncWorkflowFromGit: picks up new content once the remote SHA actually moves", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      const updatedContent = SIMPLE_WORKFLOW_YML + "\n# updated\n";
      await Deno.writeTextFile(
        join(ctx.fixtureDir, "workflows/deploy/workflow.yml"),
        updatedContent,
      );
      const run = async (args: string[]) => {
        const { success } = await new Deno.Command("git", {
          args,
          cwd: ctx.fixtureDir,
        }).output();
        if (!success) throw new Error(`git ${args.join(" ")} failed`);
      };
      await run(["commit", "-aqm", "update workflow"]);

      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      const content = await Deno.readTextFile(
        join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"),
      );
      assertEquals(content, updatedContent);
    },
  );
});

Deno.test("removeGitRepository: deletes the record but leaves workflows/ untouched", async () => {
  await withContext(
    { "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML },
    async (ctx) => {
      await registerGitRepository(ctx.repositories, {
        repoUrl: ctx.fixtureDir,
        projectName: "acme",
      });
      await syncWorkflowFromGit(
        ctx.repositories,
        ctx.links,
        "my-workflow",
        "acme",
        "deploy",
      );

      await removeGitRepository(ctx.repositories, "acme");

      assertEquals(await ctx.repositories.get("acme"), undefined);
      const content = await Deno.readTextFile(
        join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"),
      );
      assertEquals(content, SIMPLE_WORKFLOW_YML);
    },
  );
});
