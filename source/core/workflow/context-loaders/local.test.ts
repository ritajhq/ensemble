import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { createLocalGlobalLoader, createLocalLoader } from "./local.ts";
import {
  encryptFile,
  encryptValue,
  generateKeypair,
} from "./secrets-crypto.ts";

async function withWorkflowDir(
  fn: (workflowDir: string) => Promise<void>,
): Promise<void> {
  const workflowDir = await Deno.makeTempDir({ prefix: "local-loader-" });
  try {
    await fn(workflowDir);
  } finally {
    await Deno.remove(workflowDir, { recursive: true });
  }
}

/** A resolvePrivateKey stub that always rejects — for tests that only exercise the plaintext/variable paths, which should never need a key. */
function noKeyNeeded(): Promise<string> {
  return Promise.reject(
    new Error("no key should have been needed for this test"),
  );
}

Deno.test("local loader: isAvailable is false when contexts/<name> doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(await loader.isAvailable("production"), false);
  });
});

Deno.test("local loader: isAvailable is true when contexts/<name> exists", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(await loader.isAvailable("production"), true);
  });
});

Deno.test("local loader: loadVariable reads a key out of contexts/<name>/variables.env", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      "IMAGE_TAG=v1.2.3\n",
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    const result = await loader.loadVariable("production", "IMAGE_TAG");
    assertEquals(result?.scalar, "v1.2.3");
    assertEquals(result?.filePath, undefined);
  });
});

Deno.test("local loader: variables.env can declare multiple KEY=value lines", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      "IMAGE_TAG=v1.2.3\nREGION=us-east-1\n",
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(
      (await loader.loadVariable("production", "IMAGE_TAG"))?.scalar,
      "v1.2.3",
    );
    assertEquals(
      (await loader.loadVariable("production", "REGION"))?.scalar,
      "us-east-1",
    );
  });
});

Deno.test("local loader: loadSecret reads a plaintext key out of contexts/<name>/secrets.enc (tolerant of a not-yet-encrypted value)", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "staging"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "staging", "secrets.enc"),
      "GITHUB_WEBHOOK_SECRET: shh\n",
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    const result = await loader.loadSecret("staging", "GITHUB_WEBHOOK_SECRET");
    assertEquals(result?.scalar, "shh");
  });
});

Deno.test("local loader: loadSecret decrypts an ENC[...] value using the resolved private key", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const { privateKey, publicKey } = await generateKeypair();
    await Deno.mkdir(join(workflowDir, "contexts", "staging"), {
      recursive: true,
    });
    const marker = await encryptValue(publicKey, "shh");
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "staging", "secrets.enc"),
      `GITHUB_WEBHOOK_SECRET: "${marker}"\n`,
    );

    const loader = createLocalLoader(
      workflowDir,
      () => Promise.resolve(privateKey),
      workflowDir,
    );
    const result = await loader.loadSecret("staging", "GITHUB_WEBHOOK_SECRET");
    assertEquals(result?.scalar, "shh");
  });
});

Deno.test("local loader: loadSecret propagates a resolvePrivateKey failure when an ENC[...] value needs decrypting", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const { publicKey } = await generateKeypair();
    await Deno.mkdir(join(workflowDir, "contexts", "staging"), {
      recursive: true,
    });
    const marker = await encryptValue(publicKey, "shh");
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "staging", "secrets.enc"),
      `TOKEN: "${marker}"\n`,
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    await assertRejects(
      () => loader.loadSecret("staging", "TOKEN"),
      Error,
      "no key should have been needed",
    );
  });
});

Deno.test("local loader: loadVariable returns undefined when variables.env exists but the key isn't in it", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      "OTHER=x\n",
    );
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(await loader.loadVariable("production", "MISSING"), undefined);
  });
});

Deno.test("local loader: loadVariable returns undefined when variables.env doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(
      await loader.loadVariable("production", "IMAGE_TAG"),
      undefined,
    );
  });
});

Deno.test("local loader: loadVariable returns undefined when the context itself doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(
      await loader.loadVariable("nonexistent", "IMAGE_TAG"),
      undefined,
    );
  });
});

Deno.test("local loader: variables.env handles quoted values and ignores blank/comment lines", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "variables.env"),
      '# a comment\n\nGREETING="hello world"\n',
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    const result = await loader.loadVariable("production", "GREETING");
    assertEquals(result?.scalar, "hello world");
  });
});

Deno.test("local loader: loadVariableFile reads an exact filename verbatim directly from the context folder", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(workflowDir, "contexts", "production", "TF_VARS.json"),
      '{"a":1}',
    );

    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    const path = await loader.loadVariableFile("production", "TF_VARS.json");
    assertEquals(
      path,
      join(workflowDir, "contexts", "production", "TF_VARS.json"),
    );
    assertEquals(await Deno.readTextFile(path!), '{"a":1}');
  });
});

Deno.test("local loader: loadSecretFile decrypts <filename>.enc from the secrets/ folder into a temp path under runDir", async () => {
  await withWorkflowDir(async (workflowDir) => {
    const { privateKey, publicKey } = await generateKeypair();
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), {
      recursive: true,
    });
    const encrypted = await encryptFile(
      publicKey,
      new TextEncoder().encode('{"token":"abc"}'),
    );
    await Deno.writeFile(
      join(workflowDir, "contexts", "production", "secrets", "creds.json.enc"),
      encrypted,
    );

    const runDir = await Deno.makeTempDir({ prefix: "local-loader-run-" });
    try {
      const loader = createLocalLoader(
        workflowDir,
        () => Promise.resolve(privateKey),
        runDir,
      );
      const path = await loader.loadSecretFile("production", "creds.json");
      assertEquals(await Deno.readTextFile(path!), '{"token":"abc"}');
      assertEquals(path!.startsWith(runDir), true);
    } finally {
      await Deno.remove(runDir, { recursive: true });
    }
  });
});

Deno.test("local loader: loadVariableFile returns undefined when the exact filename doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "variables"), {
      recursive: true,
    });
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(
      await loader.loadVariableFile("production", "MISSING.json"),
      undefined,
    );
  });
});

Deno.test("local loader: loadSecretFile returns undefined when <filename>.enc doesn't exist", async () => {
  await withWorkflowDir(async (workflowDir) => {
    await Deno.mkdir(join(workflowDir, "contexts", "production", "secrets"), {
      recursive: true,
    });
    const loader = createLocalLoader(workflowDir, noKeyNeeded, workflowDir);
    assertEquals(
      await loader.loadSecretFile("production", "MISSING.json"),
      undefined,
    );
  });
});

Deno.test("local global loader: isAvailable is false when .ensemble/global doesn't exist", async () => {
  await withWorkflowDir(async (repoRoot) => {
    const loader = createLocalGlobalLoader(repoRoot, noKeyNeeded, repoRoot);
    assertEquals(await loader.isAvailable(""), false);
  });
});

Deno.test("local global loader: loadSecret reads .ensemble/global/secrets.enc, ignoring the contextName argument", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "secrets.enc"),
      "REGISTRY_PASSWORD: hunter2\n",
    );

    const loader = createLocalGlobalLoader(repoRoot, noKeyNeeded, repoRoot);
    assertEquals(
      (await loader.loadSecret("production", "REGISTRY_PASSWORD"))?.scalar,
      "hunter2",
    );
    assertEquals(
      (await loader.loadSecret("", "REGISTRY_PASSWORD"))?.scalar,
      "hunter2",
    );
  });
});

Deno.test("local global loader: loadVariable reads .ensemble/global/variables.env", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "variables.env"),
      "REGION=us-east-1\n",
    );

    const loader = createLocalGlobalLoader(repoRoot, noKeyNeeded, repoRoot);
    assertEquals(
      (await loader.loadVariable("staging", "REGION"))?.scalar,
      "us-east-1",
    );
  });
});

Deno.test("local global loader: loadSecret returns undefined for a key with no matching entry", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "secrets.enc"),
      "OTHER: x\n",
    );
    const loader = createLocalGlobalLoader(repoRoot, noKeyNeeded, repoRoot);
    assertEquals(await loader.loadSecret("production", "MISSING"), undefined);
  });
});

Deno.test("local global loader: loadVariableFile reads .ensemble/global/<filename> verbatim", async () => {
  await withWorkflowDir(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "global"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "global", "SHARED.json"),
      '{"x":1}',
    );

    const loader = createLocalGlobalLoader(repoRoot, noKeyNeeded, repoRoot);
    const path = await loader.loadVariableFile("", "SHARED.json");
    assertEquals(await Deno.readTextFile(path!), '{"x":1}');
  });
});
