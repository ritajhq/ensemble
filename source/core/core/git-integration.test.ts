import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import {
  listRepoWorkflowCandidates,
  registerGitRepository,
  removeGitRepository,
  syncWorkflowFromGit,
} from "./git-integration.ts";
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
  const fixtureDir = await Deno.makeTempDir({ prefix: "git-integration-fixture-" });
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
  await withContext({ "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML }, async (ctx) => {
    const record = await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    assertEquals(record.projectName, "acme");
    assertEquals(record.auth, { type: "none" });
    assertEquals(await ctx.repositories.get("acme"), record);

    const workflowsEntries = [...Deno.readDirSync(join(ctx.repoRoot, "workflows"))];
    assertEquals(workflowsEntries.length, 0);
  });
});

Deno.test("registerGitRepository: derives the project name from the repo URL when omitted", async () => {
  await withContext({ "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML }, async (ctx) => {
    const record = await registerGitRepository(ctx.repositories, { repoUrl: `${ctx.fixtureDir}/` });
    const expectedName = ctx.fixtureDir.split("/").pop();
    assertEquals(record.projectName, expectedName);
  });
});

Deno.test("registerGitRepository: throws when the repo has no workflows/ folder", async () => {
  await withContext({ "README.md": "hi" }, async (ctx) => {
    await assertRejects(
      () => registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" }),
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
    await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    const candidates = await listRepoWorkflowCandidates(ctx.repositories, "acme");
    const byPath = Object.fromEntries(candidates.map((c) => [c.pathInRepo, c.hasTrigger]));
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
  await withContext({ "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML }, async (ctx) => {
    await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    await syncWorkflowFromGit(ctx.repositories, ctx.links, "my-workflow", "acme", "deploy");

    const content = await Deno.readTextFile(join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"));
    assertEquals(content, SIMPLE_WORKFLOW_YML);

    const link = await ctx.links.get("my-workflow");
    assertEquals(link?.projectName, "acme");
    assertEquals(link?.pathInRepo, "deploy");
  });
});

Deno.test("syncWorkflowFromGit: throws (and doesn't touch the live dir) when the candidate path has no workflow.yml", async () => {
  await withContext({ "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML }, async (ctx) => {
    await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    await assertRejects(
      () => syncWorkflowFromGit(ctx.repositories, ctx.links, "my-workflow", "acme", "nonexistent"),
      Error,
      "workflow.yml",
    );

    const exists = await Deno.stat(join(ctx.repoRoot, "workflows", "my-workflow")).then(() => true).catch(() => false);
    assertEquals(exists, false);
  });
});

Deno.test("syncWorkflowFromGit: throws for an invalid workflow.yml without touching the live dir", async () => {
  await withContext({ "workflows/broken/workflow.yml": "not: [valid" }, async (ctx) => {
    await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    await assertRejects(() => syncWorkflowFromGit(ctx.repositories, ctx.links, "my-workflow", "acme", "broken"));

    const exists = await Deno.stat(join(ctx.repoRoot, "workflows", "my-workflow")).then(() => true).catch(() => false);
    assertEquals(exists, false);
  });
});

Deno.test("removeGitRepository: deletes the record but leaves workflows/ untouched", async () => {
  await withContext({ "workflows/deploy/workflow.yml": SIMPLE_WORKFLOW_YML }, async (ctx) => {
    await registerGitRepository(ctx.repositories, { repoUrl: ctx.fixtureDir, projectName: "acme" });
    await syncWorkflowFromGit(ctx.repositories, ctx.links, "my-workflow", "acme", "deploy");

    await removeGitRepository(ctx.repositories, "acme");

    assertEquals(await ctx.repositories.get("acme"), undefined);
    const content = await Deno.readTextFile(join(ctx.repoRoot, "workflows", "my-workflow", "workflow.yml"));
    assertEquals(content, SIMPLE_WORKFLOW_YML);
  });
});
