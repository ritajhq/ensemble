import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import type { Context } from "../schema.ts";
import { ContextResolutionError, resolveContext } from "./resolve.ts";

async function withDirs(fn: (workflowDir: string, runDir: string) => Promise<void>): Promise<void> {
  const workflowDir = await Deno.makeTempDir({ prefix: "resolve-workflow-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-run-" });
  try {
    await fn(workflowDir, runDir);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
}

Deno.test("resolveContext: undefined context returns empty env", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const result = await resolveContext(undefined, undefined, workflowDir, runDir, undefined);
    assertEquals(result.env, {});
  });
});

Deno.test("resolveContext: an inline value skips loaders entirely and materializes a _FILE companion", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { variables: { REGION: { value: "us-east-1" } } };
    const result = await resolveContext(context, undefined, workflowDir, runDir, undefined);
    assertEquals(result.env.REGION, "us-east-1");
    assertEquals(await Deno.readTextFile(result.env.REGION_FILE), "us-east-1");
  });
});

Deno.test("resolveContext: also returns each context.variables entry structured, for context.variables.<key>.{name,value,path} interpolation", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { variables: { REGION: { value: "us-east-1" } } };
    const result = await resolveContext(context, undefined, workflowDir, runDir, undefined);
    assertEquals(result.variables.REGION.name, "REGION");
    assertEquals(result.variables.REGION.value, "us-east-1");
    assertEquals(result.variables.REGION.path, result.env.REGION_FILE);
  });
});

Deno.test("resolveContext: context.secrets are not included in the structured variables map", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { secrets: [{ name: "TOKEN", default: "shh" }] };
    const result = await resolveContext(context, undefined, workflowDir, runDir, undefined);
    assertEquals(result.env.TOKEN, "shh");
    assertEquals(result.variables.TOKEN, undefined);
  });
});

Deno.test("resolveContext: a loader-sourced variable resolves from the local loader", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG.env"), "IMAGE_TAG=v1\n");

    const context: Context = { variables: { IMAGE_TAG: {} } };
    const result = await resolveContext(context, "production", workflowDir, runDir, undefined);
    assertEquals(result.env.IMAGE_TAG, "v1");
    assertEquals(await Deno.readTextFile(result.env.IMAGE_TAG_FILE), "v1");
  });
});

Deno.test("resolveContext: falls back to default when no loader supplies the variable", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { variables: { IMAGE_TAG: { default: "latest" } } };
    const result = await resolveContext(context, undefined, workflowDir, runDir, undefined);
    assertEquals(result.env.IMAGE_TAG, "latest");
  });
});

Deno.test("resolveContext: missing variable with no value/default/loader-hit throws, aggregating every missing name", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = {
      variables: { DB_HOST: {}, DB_PORT: {} },
    };
    const error = await assertRejects(
      () => resolveContext(context, undefined, workflowDir, runDir, undefined),
      ContextResolutionError,
    );
    assertEquals(error.message.includes("DB_HOST"), true);
    assertEquals(error.message.includes("DB_PORT"), true);
  });
});

Deno.test("resolveContext: secrets are always loader-sourced (never inline) and fail without a matching loader value", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { secrets: [{ name: "TOKEN" }] };
    await assertRejects(
      () => resolveContext(context, undefined, workflowDir, runDir, undefined),
      ContextResolutionError,
      "TOKEN",
    );
  });
});

Deno.test("resolveContext: a secret resolves from the local loader's secrets/<key>.env", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "secrets", "TOKEN.env"), "TOKEN=abc123\n");

    const context: Context = { secrets: [{ name: "TOKEN" }] };
    const result = await resolveContext(context, "production", workflowDir, runDir, undefined);
    assertEquals(result.env.TOKEN, "abc123");
  });
});

Deno.test("resolveContext: --context-source local restricts to the local loader only", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG.env"), "IMAGE_TAG=v1\n");

    const context: Context = { variables: { IMAGE_TAG: {} } };
    const result = await resolveContext(context, "production", workflowDir, runDir, "local");
    assertEquals(result.env.IMAGE_TAG, "v1");
  });
});

Deno.test("resolveContext: --context-source vault does not fall through to a local contexts/ folder that has the value", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), { recursive: true });
    await Deno.writeTextFile(join(workflowDir, "contexts", "production", "variables", "IMAGE_TAG.env"), "IMAGE_TAG=v1\n");

    const context: Context = { variables: { IMAGE_TAG: {} } };
    await assertRejects(
      () => resolveContext(context, "production", workflowDir, runDir, "vault"),
      ContextResolutionError,
      "IMAGE_TAG",
    );
  });
});

Deno.test("resolveContext: falls back to the .ensemble/global/ tier when no per-context loader has the value", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const repoRoot = await Deno.makeTempDir({ prefix: "resolve-repo-" });
    try {
      await Deno.mkdir(join(repoRoot, ".ensemble", "global", "secrets"), { recursive: true });
      await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "secrets", "REGISTRY_PASSWORD.env"), "REGISTRY_PASSWORD=hunter2\n");

      const context: Context = { secrets: [{ name: "REGISTRY_PASSWORD" }] };
      // No --context passed at all — the global tier doesn't need one.
      const result = await resolveContext(context, undefined, workflowDir, runDir, undefined, {}, repoRoot);
      assertEquals(result.env.REGISTRY_PASSWORD, "hunter2");
    } finally {
      await Deno.remove(repoRoot, { recursive: true });
    }
  });
});

Deno.test("resolveContext: a per-context loader's value wins over the global tier when both have it", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const repoRoot = await Deno.makeTempDir({ prefix: "resolve-repo-" });
    try {
      await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), { recursive: true });
      await Deno.writeTextFile(join(workflowDir, "contexts", "production", "secrets", "TOKEN.env"), "TOKEN=per-context\n");
      await Deno.mkdir(join(repoRoot, ".ensemble", "global", "secrets"), { recursive: true });
      await Deno.writeTextFile(join(repoRoot, ".ensemble", "global", "secrets", "TOKEN.env"), "TOKEN=global\n");

      const context: Context = { secrets: [{ name: "TOKEN" }] };
      const result = await resolveContext(context, "production", workflowDir, runDir, undefined, {}, repoRoot);
      assertEquals(result.env.TOKEN, "per-context");
    } finally {
      await Deno.remove(repoRoot, { recursive: true });
    }
  });
});

Deno.test("resolveContext: still fails when neither a per-context loader nor the global tier has the value", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const repoRoot = await Deno.makeTempDir({ prefix: "resolve-repo-" });
    try {
      const context: Context = { secrets: [{ name: "MISSING" }] };
      await assertRejects(
        () => resolveContext(context, undefined, workflowDir, runDir, undefined, {}, repoRoot),
        ContextResolutionError,
        "MISSING",
      );
    } finally {
      await Deno.remove(repoRoot, { recursive: true });
    }
  });
});
