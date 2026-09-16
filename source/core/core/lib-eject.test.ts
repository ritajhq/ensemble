import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import type { PackageSource, PullRequestRef } from "./vendor/package-source.ts";
import { FileRegistry } from "./vendor/registry.ts";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import { LibEjector } from "./lib-eject.ts";

class FakePackageSource implements PackageSource {
  calls: { method: string; args: unknown[] }[] = [];

  fetch(): Promise<void> {
    throw new Error("not used by LibEjector");
  }
  currentRef(): Promise<string> {
    throw new Error("not used by LibEjector");
  }
  flattenHistory(dir: string): Promise<void> {
    this.calls.push({ method: "flattenHistory", args: [dir] });
    return Promise.resolve();
  }
  publishTo(dir: string, location: string): Promise<string> {
    this.calls.push({ method: "publishTo", args: [dir, location] });
    return Promise.resolve("deadbeef");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by LibEjector");
  }
  switchTo(): Promise<void> {
    throw new Error("not used by LibEjector");
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by LibEjector");
  }
}

async function writeLib(
  repoRoot: string,
  name: string,
  imports: Record<string, string> = {},
): Promise<string> {
  const libRoot = join(repoRoot, "source", "libs", name);
  await Deno.mkdir(libRoot, { recursive: true });
  await Deno.writeTextFile(
    join(libRoot, "deno.json"),
    JSON.stringify({ name: `@x/${name}`, imports }, null, 2),
  );
  return libRoot;
}

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-eject-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("LibEjector.eject: a clean lib ejects and registers correctly", async () => {
  await withRepoRoot(async (repoRoot) => {
    await writeLib(repoRoot, "widgets");

    const source = new FakePackageSource();
    const registry = new FileRegistry(repoRoot);
    const ejector = new LibEjector(
      repoRoot,
      new SelfContainmentChecker(repoRoot),
      registry,
      source,
    );

    const entry = await ejector.eject(
      "widgets",
      "https://example.com/widgets.git",
    );

    const libRoot = join(repoRoot, "source", "libs", "widgets");
    assertEquals(source.calls, [
      { method: "flattenHistory", args: [libRoot] },
      {
        method: "publishTo",
        args: [libRoot, "https://example.com/widgets.git"],
      },
    ]);
    assertEquals(entry, {
      repo: "https://example.com/widgets.git",
      ref: "deadbeef",
      path: "source/libs/widgets",
    });
    assertEquals(await registry.entryFor("source/libs/widgets"), entry);
  });
});

Deno.test("LibEjector.eject: a violating lib aborts before any git operation", async () => {
  await withRepoRoot(async (repoRoot) => {
    // "widgets" imports from source/core, which is always a self-containment violation.
    await Deno.mkdir(join(repoRoot, "source", "core", "kit-sdk"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, "source", "core", "kit-sdk", "deno.json"),
      JSON.stringify({ name: "@ensemble/kit-sdk" }),
    );
    await writeLib(repoRoot, "widgets", {
      "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk",
    });

    const source = new FakePackageSource();
    const registry = new FileRegistry(repoRoot);
    const ejector = new LibEjector(
      repoRoot,
      new SelfContainmentChecker(repoRoot),
      registry,
      source,
    );

    await assertRejects(
      () => ejector.eject("widgets", "https://example.com/widgets.git"),
      Error,
      "isn't self-contained enough to eject",
    );
    assertEquals(source.calls, []);
    assertEquals(await registry.entryFor("source/libs/widgets"), undefined);
  });
});
