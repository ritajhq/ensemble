import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import type { Context } from "../schema.ts";
import { ContextResolutionError, resolveContext } from "./resolve.ts";
import {
  encryptFile,
  encryptValue,
  generateKeypair,
  SECRETS_PRIVATE_KEY_PATH,
} from "./secrets-crypto.ts";

async function withDirs(
  fn: (workflowDir: string, runDir: string) => Promise<void>,
): Promise<void> {
  const workflowDir = await Deno.makeTempDir({ prefix: "resolve-workflow-" });
  const runDir = await Deno.makeTempDir({ prefix: "resolve-run-" });
  try {
    await fn(workflowDir, runDir);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
    await Deno.remove(runDir, { recursive: true });
  }
}

/** Same as withDirs, but also sets up a real repoRoot with .ensemble/secrets.key, for tests that need a private key to decrypt secrets.enc. Returns the matching public key for the caller to encrypt test fixtures with. */
async function withDirsAndKey(
  fn: (
    workflowDir: string,
    runDir: string,
    repoRoot: string,
    publicKey: string,
  ) => Promise<void>,
): Promise<void> {
  await withDirs(async (workflowDir, runDir) => {
    const repoRoot = await Deno.makeTempDir({ prefix: "resolve-repo-" });
    try {
      const keypair = await generateKeypair();
      await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
      await Deno.writeTextFile(
        join(repoRoot, SECRETS_PRIVATE_KEY_PATH),
        keypair.privateKey,
      );
      await fn(workflowDir, runDir, repoRoot, keypair.publicKey);
    } finally {
      await Deno.remove(repoRoot, { recursive: true });
    }
  });
}

Deno.test("resolveContext: undefined context returns empty env", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const result = await resolveContext(
      undefined,
      [],
      undefined,
      workflowDir,
      runDir,
    );
    assertEquals(result.env, {});
  });
});

Deno.test("resolveContext: an inline value skips loaders entirely and materializes a _FILE companion", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = {
      variables: [{ name: "REGION", value: "us-east-1" }],
    };
    const result = await resolveContext(
      context,
      [],
      undefined,
      workflowDir,
      runDir,
    );
    assertEquals(result.env.REGION, "us-east-1");
    assertEquals(await Deno.readTextFile(result.env.REGION_FILE), "us-east-1");
  });
});

Deno.test("resolveContext: also returns each context.variables entry structured, for context.variables.<key>.{name,value,path} interpolation", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = {
      variables: [{ name: "REGION", value: "us-east-1" }],
    };
    const result = await resolveContext(
      context,
      [],
      undefined,
      workflowDir,
      runDir,
    );
    assertEquals(result.variables.REGION.name, "REGION");
    assertEquals(result.variables.REGION.value, "us-east-1");
    assertEquals(result.variables.REGION.path, result.env.REGION_FILE);
  });
});

Deno.test("resolveContext: context.secrets are not included in the structured variables map", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = { secrets: [{ name: "TOKEN", default: "shh" }] };
    const result = await resolveContext(
      context,
      [],
      undefined,
      workflowDir,
      runDir,
    );
    assertEquals(result.env.TOKEN, "shh");
    assertEquals(result.variables.TOKEN, undefined);
  });
});

Deno.test("resolveContext: a loader-sourced variable resolves from the local loader", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      "IMAGE_TAG=v1\n",
    );

    const context: Context = { variables: [{ name: "IMAGE_TAG" }] };
    const result = await resolveContext(
      context,
      [],
      "production",
      workflowDir,
      runDir,
    );
    assertEquals(result.env.IMAGE_TAG, "v1");
    assertEquals(await Deno.readTextFile(result.env.IMAGE_TAG_FILE), "v1");
  });
});

Deno.test("resolveContext: falls back to default when no loader supplies the variable", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = {
      variables: [{ name: "IMAGE_TAG", default: "latest" }],
    };
    const result = await resolveContext(
      context,
      [],
      undefined,
      workflowDir,
      runDir,
    );
    assertEquals(result.env.IMAGE_TAG, "latest");
  });
});

Deno.test("resolveContext: missing variable with no value/default/loader-hit throws, aggregating every missing name", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const context: Context = {
      variables: [{ name: "DB_HOST" }, { name: "DB_PORT" }],
    };
    const error = await assertRejects(
      () => resolveContext(context, [], undefined, workflowDir, runDir),
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
      () => resolveContext(context, [], undefined, workflowDir, runDir),
      ContextResolutionError,
      "TOKEN",
    );
  });
});

Deno.test("resolveContext: a plaintext secrets.enc value resolves without needing a key (tolerant of a not-yet-encrypted file)", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "secrets.enc"),
      "TOKEN: abc123\n",
    );

    const context: Context = { secrets: [{ name: "TOKEN" }] };
    const result = await resolveContext(
      context,
      [],
      "production",
      workflowDir,
      runDir,
    );
    assertEquals(result.env.TOKEN, "abc123");
  });
});

Deno.test("resolveContext: an encrypted secrets.enc value decrypts using .ensemble/secrets.key", async () => {
  await withDirsAndKey(async (workflowDir, runDir, repoRoot, publicKey) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    const marker = await encryptValue(publicKey, "abc123");
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "secrets.enc"),
      `TOKEN: "${marker}"\n`,
    );

    const context: Context = { secrets: [{ name: "TOKEN" }] };
    const result = await resolveContext(
      context,
      [],
      "production",
      workflowDir,
      runDir,
      {},
      repoRoot,
    );
    assertEquals(result.env.TOKEN, "abc123");
  });
});

Deno.test("resolveContext: an encrypted secret with no key available anywhere fails with a clear error", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    const { publicKey } = await generateKeypair();
    const marker = await encryptValue(publicKey, "abc123");
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "secrets.enc"),
      `TOKEN: "${marker}"\n`,
    );

    const context: Context = { secrets: [{ name: "TOKEN" }] };
    // No repoRoot passed — no .ensemble/secrets.key to find, no ENSEMBLE_SECRETS_KEY set.
    await assertRejects(
      () => resolveContext(context, [], "production", workflowDir, runDir),
      Error,
      "secrets private key",
    );
  });
});

Deno.test("resolveContext: falls back to the .ensemble/global/ tier when no per-context loader has the value", async () => {
  await withDirs(async (workflowDir, runDir) => {
    const repoRoot = await Deno.makeTempDir({ prefix: "resolve-repo-" });
    try {
      await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
        recursive: true,
      });
      await Deno.writeTextFile(
        join(repoRoot, ".ensemble", "global", "secrets.enc"),
        "REGISTRY_PASSWORD: hunter2\n",
      );

      const context: Context = { secrets: [{ name: "REGISTRY_PASSWORD" }] };
      // No --context passed at all — the global tier doesn't need one.
      const result = await resolveContext(
        context,
        [],
        undefined,
        workflowDir,
        runDir,
        {},
        repoRoot,
      );
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
      await Deno.mkdir(join(workflowDir, "contexts", "production"), {
        recursive: true,
      });
      await Deno.writeTextFile(
        join(workflowDir, "contexts", "production", "secrets.enc"),
        "TOKEN: per-context\n",
      );
      await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
        recursive: true,
      });
      await Deno.writeTextFile(
        join(repoRoot, ".ensemble", "global", "secrets.enc"),
        "TOKEN: global\n",
      );

      const context: Context = { secrets: [{ name: "TOKEN" }] };
      const result = await resolveContext(
        context,
        [],
        "production",
        workflowDir,
        runDir,
        {},
        repoRoot,
      );
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
        () =>
          resolveContext(
            context,
            [],
            undefined,
            workflowDir,
            runDir,
            {},
            repoRoot,
          ),
        ContextResolutionError,
        "MISSING",
      );
    } finally {
      await Deno.remove(repoRoot, { recursive: true });
    }
  });
});

Deno.test("resolveContext: resolves a statically-found contextFile() reference to a real path, verbatim (no parsing)", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "TF_VARS.json"),
      '{"a":1}',
    );

    const result = await resolveContext(
      undefined,
      [{ kind: "file", filename: "TF_VARS.json" }],
      "production",
      workflowDir,
      runDir,
    );
    assertEquals(
      await Deno.readTextFile(result.files["TF_VARS.json"]),
      '{"a":1}',
    );
  });
});

Deno.test("resolveContext: resolves a statically-found contextSecretFile() reference, decrypting it from the secrets/ folder", async () => {
  await withDirsAndKey(async (workflowDir, runDir, repoRoot, publicKey) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), {
      recursive: true,
    });
    const plaintext = new TextEncoder().encode('{"token":"abc"}');
    const encrypted = await encryptFile(publicKey, plaintext);
    await Deno.writeFile(
      join(workflowDir, "contexts", "production", "secrets", "creds.json.enc"),
      encrypted,
    );

    const result = await resolveContext(
      undefined,
      [{ kind: "secretFile", filename: "creds.json" }],
      "production",
      workflowDir,
      runDir,
      {},
      repoRoot,
    );
    assertEquals(
      await Deno.readTextFile(result.secretFiles["creds.json"]),
      '{"token":"abc"}',
    );
    assertEquals(result.files["creds.json"], undefined);
  });
});

Deno.test("resolveContext: a contextFile() reference works even when the workflow declares no context: block at all", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "TF_VARS.json"),
      "{}",
    );

    const result = await resolveContext(
      undefined,
      [{ kind: "file", filename: "TF_VARS.json" }],
      "production",
      workflowDir,
      runDir,
    );
    assertEquals(await Deno.readTextFile(result.files["TF_VARS.json"]), "{}");
  });
});

Deno.test("resolveContext: an unresolvable contextFile() reference fails fast before any job runs", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await assertRejects(
      () =>
        resolveContext(
          undefined,
          [{ kind: "file", filename: "MISSING.json" }],
          "production",
          workflowDir,
          runDir,
        ),
      ContextResolutionError,
      "MISSING.json",
    );
  });
});

Deno.test("resolveContext: an unresolvable contextSecretFile() reference fails fast before any job runs", async () => {
  await withDirs(async (workflowDir, runDir) => {
    await assertRejects(
      () =>
        resolveContext(
          undefined,
          [{ kind: "secretFile", filename: "MISSING.json" }],
          "production",
          workflowDir,
          runDir,
        ),
      ContextResolutionError,
      "MISSING.json",
    );
  });
});
