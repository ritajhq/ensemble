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

Deno.test("local loader: loadVariable reads a key out of contexts/<name>/variables.env", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables.env"), "IMAGE_TAG=v1.2.3\n");

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadVariable("production", "IMAGE_TAG");
    assertEquals(result?.scalar, "v1.2.3");
    assertEquals(result?.filePath, undefined);
  });
});

Deno.test("local loader: variables.env can declare multiple KEY=value lines", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      "IMAGE_TAG=v1.2.3\nREGION=us-east-1\n",
    );

    const loader = createLocalLoader(workflowDir);
    assertEquals((await loader.loadVariable("production", "IMAGE_TAG"))?.scalar, "v1.2.3");
    assertEquals((await loader.loadVariable("production", "REGION"))?.scalar, "us-east-1");
  });
});

Deno.test("local loader: loadSecret reads a key out of contexts/<name>/secrets.env", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "staging"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "staging", "secrets.env"),
      "GITHUB_WEBHOOK_SECRET=shh\n",
    );

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadSecret("staging", "GITHUB_WEBHOOK_SECRET");
    assertEquals(result?.scalar, "shh");
  });
});

Deno.test("local loader: loadVariable returns undefined when variables.env exists but the key isn't in it", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables.env"), "OTHER=x\n");
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariable("production", "MISSING"), undefined);
  });
});

Deno.test("local loader: loadVariable returns undefined when variables.env doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariable("production", "IMAGE_TAG"), undefined);
  });
});

Deno.test("local loader: loadVariable returns undefined when the context itself doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariable("nonexistent", "IMAGE_TAG"), undefined);
  });
});

Deno.test("local loader: variables.env handles quoted values and ignores blank/comment lines", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), { recursive: true });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      '# a comment\n\nGREETING="hello world"\n',
    );

    const loader = createLocalLoader(workflowDir);
    const result = await loader.loadVariable("production", "GREETING");
    assertEquals(result?.scalar, "hello world");
  });
});

Deno.test("local loader: loadVariableFile reads an exact filename verbatim from the variables/ folder", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "TF_VARS.json"), '{"a":1}');

    const loader = createLocalLoader(workflowDir);
    const path = await loader.loadVariableFile("production", "TF_VARS.json");
    assertEquals(path, join(workflowDir, "contexts", "production", "variables", "TF_VARS.json"));
    assertEquals(await Deno.readTextFile(path!), '{"a":1}');
  });
});

Deno.test("local loader: loadSecretFile reads an exact filename verbatim from the secrets/ folder", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "secrets", "creds.json"), '{"token":"abc"}');

    const loader = createLocalLoader(workflowDir);
    const path = await loader.loadSecretFile("production", "creds.json");
    assertEquals(await Deno.readTextFile(path!), '{"token":"abc"}');
  });
});

Deno.test("local loader: loadVariableFile returns undefined when the exact filename doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    const loader = createLocalLoader(workflowDir);
    assertEquals(await loader.loadVariableFile("production", "MISSING.json"), undefined);
  });
});

Deno.test("local global loader: isAvailable is false when .ensemble/global doesn't exist", async () => {
  await withWorkflowDir(async (repoRoot) => {
    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals(await loader.isAvailable(""), false);
  });
});

Deno.test("local global loader: loadSecret reads .ensemble/global/secrets.env, ignoring the contextName argument", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), { recursive: true });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "secrets.env"),
      "REGISTRY_PASSWORD=hunter2\n",
    );

    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals((await loader.loadSecret("production", "REGISTRY_PASSWORD"))?.scalar, "hunter2");
    assertEquals((await loader.loadSecret("", "REGISTRY_PASSWORD"))?.scalar, "hunter2");
  });
});

Deno.test("local global loader: loadVariable reads .ensemble/global/variables.env", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), { recursive: true });
    await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "variables.env"), "REGION=us-east-1\n");

    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals((await loader.loadVariable("staging", "REGION"))?.scalar, "us-east-1");
  });
});

Deno.test("local global loader: loadSecret returns undefined for a key with no matching entry", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), { recursive: true });
    await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "secrets.env"), "OTHER=x\n");
    const loader = createLocalGlobalLoader(repoRoot);
    assertEquals(await loader.loadSecret("production", "MISSING"), undefined);
  });
});

Deno.test("local global loader: loadVariableFile reads .ensemble/global/variables/<filename> verbatim", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global", "variables"), { recursive: true });
    await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "variables", "SHARED.json"), '{"x":1}');

    const loader = createLocalGlobalLoader(repoRoot);
    const path = await loader.loadVariableFile("", "SHARED.json");
    assertEquals(await Deno.readTextFile(path!), '{"x":1}');
  });
});
