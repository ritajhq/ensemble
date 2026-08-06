import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import type { Contexts } from "./schema.ts";
import { resolveContext, WorkflowContextError } from "./resolve-context.ts";

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

Deno.test("resolveContext: no contexts declared, no --context given returns undefined", async () => {
  const result = await resolveContext(undefined, undefined, "/workflow", "/run");
  assertEquals(result, undefined);
});

Deno.test("resolveContext: no contexts declared but --context given falls back to legacy (undefined here)", async () => {
  const result = await resolveContext(undefined, "production", "/workflow", "/run");
  assertEquals(result, undefined);
});

Deno.test("resolveContext: contexts declared but neither --context nor default given throws", async () => {
  const contexts: Contexts = { entries: { production: { local: "./contexts/production" } } };
  await assertRejects(
    () => resolveContext(contexts, undefined, "/workflow", "/run"),
    WorkflowContextError,
    "a --context is required",
  );
});

Deno.test("resolveContext: unknown --context name throws", async () => {
  const contexts: Contexts = { entries: { production: { local: "./contexts/production" } } };
  await assertRejects(
    () => resolveContext(contexts, "staging", "/workflow", "/run"),
    WorkflowContextError,
    'Unknown context "staging"',
  );
});

Deno.test("resolveContext: local-only context copies workflow-relative files into runDir/contexts/<name>", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "resolve-ctx-workflow-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-ctx-run-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "config.yml"), "structural: true");

    const contexts: Contexts = { entries: { production: { local: "./contexts/production" } } };
    const result = await resolveContext(contexts, "production", workflowDir, runDir);

    assertEquals(result?.name, "production");
    assertEquals(result?.path, join(runDir, "contexts", "production"));
    assertEquals(await Deno.readTextFile(join(result!.path, "config.yml")), "structural: true");
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveContext: contexts.default is used when --context is omitted", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "resolve-ctx-workflow-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-ctx-run-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "config.yml"), "x");

    const contexts: Contexts = { default: "production", entries: { production: { local: "./contexts/production" } } };
    const result = await resolveContext(contexts, undefined, workflowDir, runDir);

    assertEquals(result?.name, "production");
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveContext: remote-only context clones the whole repo into runDir/contexts/<name>", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "resolve-ctx-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-ctx-run-" });
  try {
    await makeFixtureRepo(fixtureDir, { "secrets.json": '{"token":"abc"}' });

    const contexts: Contexts = { entries: { staging: { remote: { url: fixtureDir } } } };
    const result = await resolveContext(contexts, "staging", "/workflow", runDir);

    assertEquals(result?.path, join(runDir, "contexts", "staging"));
    assertEquals(await Deno.readTextFile(join(result!.path, "secrets.json")), '{"token":"abc"}');
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveContext: remote context with a path extracts only that subdirectory", async () => {
  const fixtureDir = await Deno.makeTempDir({ prefix: "resolve-ctx-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-ctx-run-" });
  try {
    await makeFixtureRepo(fixtureDir, {
      "staging/secrets.json": '{"token":"staging-secret"}',
      "production/secrets.json": '{"token":"prod-secret"}',
    });

    const contexts: Contexts = { entries: { staging: { remote: { url: fixtureDir, path: "staging" } } } };
    const result = await resolveContext(contexts, "staging", "/workflow", runDir);

    assertEquals(await Deno.readTextFile(join(result!.path, "secrets.json")), '{"token":"staging-secret"}');
    let hasProductionDir = true;
    try {
      await Deno.stat(join(result!.path, "production"));
    } catch {
      hasProductionDir = false;
    }
    assertEquals(hasProductionDir, false);
  } finally {
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});

Deno.test("resolveContext: local + remote merges, remote wins on conflicting paths", async () => {
  const workflowDir = await Deno.makeTempDir({ prefix: "resolve-ctx-workflow-" });
  const fixtureDir = await Deno.makeTempDir({ prefix: "resolve-ctx-fixture-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-ctx-run-" });
  try {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "Caddyfile"), "structural-only");
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "secrets.json"), '{"token":"placeholder"}');

    await makeFixtureRepo(fixtureDir, { "secrets.json": '{"token":"real-secret"}' });

    const contexts: Contexts = {
      entries: { production: { local: "./contexts/production", remote: { url: fixtureDir } } },
    };
    const result = await resolveContext(contexts, "production", workflowDir, runDir);

    // Local-only file survives untouched.
    assertEquals(await Deno.readTextFile(join(result!.path, "Caddyfile")), "structural-only");
    // Remote overwrote the conflicting file.
    assertEquals(await Deno.readTextFile(join(result!.path, "secrets.json")), '{"token":"real-secret"}');
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
    await Deno.remove(fixtureDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
});
