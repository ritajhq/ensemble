import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { createLocalGlobalLoader, createLocalLoader } from "./local.ts";

async function withWorkflowDir(fn: (workflowDir: string) => Promise<void>): Promise<void> {
  const workflowDir = await Deno.makeTempDir({ prefix: "local-loader-" });
  try {
    await fn(workflowDir);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
}

Deno.test("local loader: isAvailable is false when contexts/<name> doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.isAvailable("production"), false);
  });
});

Deno.test("local loader: isAvailable is true when contexts/<name> exists", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.isAvailable("production"), true);
  });
});

Deno.test("local loader: loadVariable reads contexts/<name>/variables/<key>.env", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG.env"), "IMAGE_TAG=v1.2.3\n");

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadVariable("production", "IMAGE_TAG");
    assertEquals(result?.scalar, "v1.2.3");
    assertEquals(result?.filePath, undefined);
  });
});

Deno.test("local loader: loadSecret reads contexts/<name>/secrets/<key>.env", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "staging", "secrets"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "staging", "secrets", "GITHUB_WEBHOOK_SECRET.env"),
      "GITHUB_WEBHOOK_SECRET=shh\n",
    );

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadSecret("staging", "GITHUB_WEBHOOK_SECRET");
    assertEquals(result?.scalar, "shh");
  });
});

Deno.test("local loader: loadVariable returns undefined when the context folder exists but the key file doesn't", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariable("production", "MISSING"), undefined);
  });
});

Deno.test("local loader: loadVariable returns undefined when the context itself doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariable("nonexistent", "IMAGE_TAG"), undefined);
  });
});

Deno.test("local loader: .env value handles quoted values and ignores blank/comment lines", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables", "GREETING.env"),
      '# a comment\n\nGREETING="hello world"\n',
    );

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadVariable("production", "GREETING");
    assertEquals(result?.scalar, "hello world");
  });
});

Deno.test("local global loader: isAvailable is false when .ensemble/global doesn't exist", async () => {
  await withWorkflowDir(async (repoRoot) => {
    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals(await loader.isAvailable(""), false);
  });
});

Deno.test("local global loader: loadSecret reads .ensemble/global/secrets/<key>.env, ignoring the contextName argument", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global", "secrets"), { recursive: true });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "secrets", "REGISTRY_PASSWORD.env"),
      "REGISTRY_PASSWORD=hunter2\n",
    );

    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals((await loader.loadSecret("production", "REGISTRY_PASSWORD"))?.scalar, "hunter2");
    assertEquals((await loader.loadSecret("", "REGISTRY_PASSWORD"))?.scalar, "hunter2");
  });
});

Deno.test("local global loader: loadVariable reads .ensemble/global/variables/<key>.env", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global", "variables"), { recursive: true });
    await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "variables", "REGION.env"), "REGION=us-east-1\n");

    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals((await loader.loadVariable("staging", "REGION"))?.scalar, "us-east-1");
  });
});

Deno.test("local global loader: loadSecret returns undefined for a key with no matching file", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global", "secrets"), { recursive: true });
    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals(await loader.loadSecret("production", "MISSING"), undefined);
  });
});
