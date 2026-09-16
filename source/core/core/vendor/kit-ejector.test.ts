import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { KitEjector } from "./kit-ejector.ts";

class FakePackageSource implements PackageSource {
  calls: { method: string; args: unknown[] }[] = [];

  fetch(): Promise<void> {
    throw new Error("not used by KitEjector");
  }
  currentRef(): Promise<string> {
    throw new Error("not used by KitEjector");
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
    throw new Error("not used by KitEjector");
  }
  switchTo(): Promise<void> {
    throw new Error("not used by KitEjector");
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by KitEjector");
  }
}

async function writeKit(
  repoRoot: string,
  path: string,
  manifestYaml: string,
  files: Record<string, string>,
): Promise<string> {
  const kitDir = join(repoRoot, path);
  await Deno.mkdir(kitDir, { recursive: true });
  await Deno.writeTextFile(join(kitDir, "kit.yml"), manifestYaml);
  for (const [relativePath, content] of Object.entries(files)) {
    await Deno.writeTextFile(join(kitDir, relativePath), content);
  }
  return kitDir;
}

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-ejector-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("KitEjector.eject: a well-formed kit ejects and registers correctly, importing @ensemble/kit-sdk without issue", async () => {
  await withRepoRoot(async (repoRoot) => {
    const path = join(".ensemble", "kits", "build", "widgets");
    await writeKit(repoRoot, path, `role: build\nkitSdk: "*"\n`, {
      "main.ts": `import * as KitSdk from "@ensemble/kit-sdk";\n`,
    });

    const gateway = new FakePackageSource();
    const registry = new FileRegistry(repoRoot);
    const ejector = new KitEjector(repoRoot, registry, gateway);

    const entry = await ejector.eject(path, "https://example.com/widgets.git");

    const kitDir = join(repoRoot, path);
    assertEquals(gateway.calls, [
      { method: "flattenHistory", args: [kitDir] },
      {
        method: "publishTo",
        args: [kitDir, "https://example.com/widgets.git"],
      },
    ]);
    assertEquals(entry, {
      repo: "https://example.com/widgets.git",
      ref: "deadbeef",
      path,
    });
    assertEquals(await registry.entryFor(path), entry);
  });
});

Deno.test("KitEjector.eject: rejects a kit missing its required entrypoint, before any git operation", async () => {
  await withRepoRoot(async (repoRoot) => {
    const path = join(".ensemble", "kits", "pack", "widgets");
    await writeKit(repoRoot, path, `role: pack\nkitSdk: "*"\n`, {
      "main.ts": `export {};\n`,
    });

    const gateway = new FakePackageSource();
    const ejector = new KitEjector(
      repoRoot,
      new FileRegistry(repoRoot),
      gateway,
    );

    await assertRejects(
      () => ejector.eject(path, "https://example.com/widgets.git"),
      Error,
      "publish.ts",
    );
    assertEquals(gateway.calls, []);
  });
});
