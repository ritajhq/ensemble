import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runKitNew } from "./kit-scaffold.ts";
import type { RepoLocator } from "./ports.ts";
import * as KitManifest from "./vendor/kit-manifest.ts";

function repoAt(repoRoot: string): RepoLocator {
  return { findRepoRoot: () => Promise.resolve(repoRoot) };
}

// findRepoRoot walks up from Deno.cwd() looking for a ".ensemble" marker
// before ever consulting ENSEMBLE_WORKSPACE — so, since this test itself
// runs from inside the real ensemble checkout, only actually changing cwd
// into the temp project (which has its own ".ensemble") makes it resolve
// there instead of walking up into the real repo.
async function withProjectRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ensemble-kit-scaffold-test-" });
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(dir, ".ensemble"), { recursive: true });
    Deno.chdir(dir);
    try {
      await run(dir);
    } finally {
      Deno.chdir(previousCwd);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("runKitNew: scaffolds kit.yml, deno.json, and main.ts for a build kit", async () => {
  await withProjectRoot(async (repoRoot) => {
    await runKitNew("widgets", "build", repoAt(repoRoot));

    const kitDir = join(repoRoot, ".ensemble", "kits", "build", "widgets");
    assertEquals(
      await Deno.readTextFile(join(kitDir, "kit.yml")),
      `role: build\nkitSdk: "*"\n`,
    );

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(kitDir, "deno.json")),
    );
    assertEquals(denoJson, {
      imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" },
    });

    assertEquals(
      await Deno.readTextFile(join(kitDir, "main.ts")),
      "export {};\n",
    );
  });
});

Deno.test("runKitNew: a pack kit also scaffolds publish.ts", async () => {
  await withProjectRoot(async (repoRoot) => {
    await runKitNew("widgets", "pack", repoAt(repoRoot));

    const kitDir = join(repoRoot, ".ensemble", "kits", "pack", "widgets");
    assertEquals(
      await Deno.readTextFile(join(kitDir, "main.ts")),
      "export {};\n",
    );
    assertEquals(
      await Deno.readTextFile(join(kitDir, "publish.ts")),
      "export {};\n",
    );
  });
});

Deno.test("runKitNew: the scaffolded kit.yml parses cleanly", async () => {
  await withProjectRoot(async (repoRoot) => {
    await runKitNew("widgets", "deploy", repoAt(repoRoot));

    const kitDir = join(repoRoot, ".ensemble", "kits", "deploy", "widgets");
    const manifest = await KitManifest.read(kitDir);
    assertEquals(manifest, { role: "deploy", kitSdk: "*" });
  });
});

Deno.test("runKitNew: rejects an already-existing kit directory", async () => {
  await withProjectRoot(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, ".ensemble", "kits", "lib", "widgets"), {
      recursive: true,
    });
    await assertRejects(
      () => runKitNew("widgets", "lib", repoAt(repoRoot)),
      Error,
      "already exists",
    );
  });
});

Deno.test("runKitNew: rejects an invalid kit name", async () => {
  await withProjectRoot(async (repoRoot) => {
    await assertRejects(
      () => runKitNew("../escape", "build", repoAt(repoRoot)),
      Error,
      "Invalid kit name",
    );
  });
});

Deno.test("runKitNew: rejects an invalid role", async () => {
  await withProjectRoot(async (repoRoot) => {
    // deno-lint-ignore no-explicit-any
    await assertRejects(
      () => runKitNew("widgets", "nonsense" as any, repoAt(repoRoot)),
      Error,
      "Invalid kit role",
    );
  });
});
