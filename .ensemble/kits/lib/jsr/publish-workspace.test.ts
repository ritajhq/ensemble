import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { exists } from "@std/fs";
import { PublishWorkspace } from "./publish-workspace.ts";

async function withProject(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({ prefix: "ensemble-publish-test-" });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"));
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

async function writeLib(
  repoRoot: string,
  path: string,
  manifest: object,
): Promise<string> {
  const directory = join(repoRoot, path);
  await Deno.mkdir(directory, { recursive: true });
  await Deno.writeTextFile(
    join(directory, "deno.json"),
    JSON.stringify(manifest),
  );
  return directory;
}

Deno.test("PublishWorkspace: a project with a root deno.json publishes in place", async () => {
  await withProject(async (repoRoot) => {
    await Deno.writeTextFile(join(repoRoot, "deno.json"), "{}");
    const lib = await writeLib(repoRoot, "source/core/a", { name: "@x/a" });

    assertEquals(await new PublishWorkspace(lib).prepare(), lib);
  });
});

Deno.test("PublishWorkspace: otherwise, a scratch root holds the library and only what it reaches", async () => {
  await withProject(async (repoRoot) => {
    await writeLib(repoRoot, "source/core/base", { name: "@x/base" });
    await writeLib(repoRoot, "source/core/unrelated", { name: "@x/unrelated" });
    await writeLib(repoRoot, "source/core/mid", {
      name: "@x/mid",
      imports: { "@x/base": "jsr:@x/base@^1.0.0" },
    });
    const lib = await writeLib(repoRoot, "source/core/top", {
      name: "@x/top",
      imports: { "@x/mid": "jsr:@x/mid", "@std/path": "jsr:@std/path@1" },
    });

    const directory = await new PublishWorkspace(lib).prepare();

    const scratch = join(repoRoot, ".ensemble/cache/jsr/top");
    assertEquals(directory, join(scratch, "source/core/top"));
    const root = JSON.parse(
      await Deno.readTextFile(join(scratch, "deno.json")),
    );
    assertEquals(root.workspace.toSorted(), [
      "./source/core/base",
      "./source/core/mid",
      "./source/core/top",
    ]);
    assertEquals(await exists(join(scratch, "source/core/unrelated")), false);
  });
});
