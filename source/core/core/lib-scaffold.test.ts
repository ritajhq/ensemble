import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { runLibNew } from "./lib-scaffold.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";

// findRepoRoot walks up from Deno.cwd() looking for a ".ensemble" marker
// before ever consulting ENSEMBLE_WORKSPACE — so, since this test itself
// runs from inside the real ensemble checkout, only actually changing cwd
// into the temp project (which has its own ".ensemble") makes it resolve
// there instead of walking up into the real repo.
async function withProjectRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ensemble-lib-scaffold-test-" });
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

Deno.test("runLibNew: scaffolds lib.yml, deno.json, and index.ts", async () => {
  await withProjectRoot(async (repoRoot) => {
    await runLibNew("widgets");

    const libDir = join(repoRoot, "source", "libs", "widgets");
    assertEquals(
      await Deno.readTextFile(join(libDir, "lib.yml")),
      `package: "widgets"\n`,
    );

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(libDir, "deno.json")),
    );
    assertEquals(denoJson, {
      name: "widgets",
      version: "0.0.1",
      exports: "./index.ts",
    });

    assertEquals(
      await Deno.readTextFile(join(libDir, "index.ts")),
      "export {};\n",
    );
  });
});

Deno.test("runLibNew: the scaffolded lib.yml parses cleanly as a valid declaration", async () => {
  await withProjectRoot(async (repoRoot) => {
    await runLibNew("widgets");

    const libDir = join(repoRoot, "source", "libs", "widgets");
    const declaration = await new LibDeclarationLoader(repoRoot).load(libDir);
    assertEquals(declaration, { package: "widgets", publish: [] });
  });
});

Deno.test("runLibNew: rejects an already-existing lib directory", async () => {
  await withProjectRoot(async (repoRoot) => {
    await Deno.mkdir(join(repoRoot, "source", "libs", "widgets"), {
      recursive: true,
    });
    await assertRejects(() => runLibNew("widgets"), Error, "already exists");
  });
});

Deno.test("runLibNew: rejects an invalid lib name", async () => {
  await withProjectRoot(async () => {
    await assertRejects(
      () => runLibNew("../escape"),
      Error,
      "Invalid lib name",
    );
  });
});
