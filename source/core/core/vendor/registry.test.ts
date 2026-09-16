import { join } from "@std/path";
import { assertEquals, assertStringIncludes } from "@std/assert";
import { exists } from "@std/fs";
import { FileRegistry } from "./registry.ts";

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({
    prefix: "ensemble-vendor-registry-test-",
  });
  try {
    await Deno.mkdir(join(dir, ".ensemble"), { recursive: true });
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("FileRegistry: register then entryFor round-trips", async () => {
  await withRepoRoot(async (repoRoot) => {
    const registry = new FileRegistry(repoRoot);
    await registry.register({
      repo: "https://example.com/x.git",
      ref: "abc123",
      path: ".ensemble/kits/build/x",
    });

    const found = await registry.entryFor(".ensemble/kits/build/x");
    assertEquals(found, {
      repo: "https://example.com/x.git",
      ref: "abc123",
      path: ".ensemble/kits/build/x",
    });
  });
});

Deno.test("FileRegistry: entryFor returns undefined for unknown path", async () => {
  await withRepoRoot(async (repoRoot) => {
    const registry = new FileRegistry(repoRoot);
    assertEquals(await registry.entryFor("nope"), undefined);
  });
});

Deno.test("FileRegistry: all lists every registered entry", async () => {
  await withRepoRoot(async (repoRoot) => {
    const registry = new FileRegistry(repoRoot);
    await registry.register({ repo: "a", ref: "1", path: "p1" });
    await registry.register({ repo: "b", ref: "2", path: "p2" });

    const all = await registry.all();
    assertEquals(all.length, 2);
    assertEquals(all.find((e) => e.path === "p1"), {
      repo: "a",
      ref: "1",
      path: "p1",
    });
    assertEquals(all.find((e) => e.path === "p2"), {
      repo: "b",
      ref: "2",
      path: "p2",
    });
  });
});

Deno.test("FileRegistry: registering appends the path to .gitignore exactly once", async () => {
  await withRepoRoot(async (repoRoot) => {
    const registry = new FileRegistry(repoRoot);
    await registry.register({ repo: "a", ref: "1", path: "p1" });
    await registry.register({ repo: "a", ref: "2", path: "p1" });

    const gitignore = await Deno.readTextFile(join(repoRoot, ".gitignore"));
    const occurrences = gitignore.split("\n").filter((line) =>
      line === "p1"
    ).length;
    assertEquals(occurrences, 1);
    assertStringIncludes(gitignore, "p1");
  });
});

Deno.test("FileRegistry: no lockfile yet behaves as empty", async () => {
  await withRepoRoot(async (repoRoot) => {
    const registry = new FileRegistry(repoRoot);
    assertEquals(await registry.all(), []);
    assertEquals(
      await exists(join(repoRoot, ".ensemble", "vendor.lock.yml")),
      false,
    );
  });
});
