import { join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { KitPinner } from "./kit-pinner.ts";

class FakePackageSource implements PackageSource {
  /** ref currently reported as checked out — mutated by switchTo to simulate a real checkout moving. */
  refAfterSwitch = "unset";

  fetch(): Promise<void> {
    throw new Error("not used by KitPinner");
  }
  currentRef(): Promise<string> {
    return Promise.resolve(this.refAfterSwitch);
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by KitPinner");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by KitPinner");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by KitPinner");
  }
  switchTo(): Promise<void> {
    return Promise.resolve();
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by KitPinner");
  }
}

async function withInstalledKit(
  manifestYaml: string,
  files: Record<string, string>,
): Promise<{ repoRoot: string; path: string; cleanup: () => Promise<void> }> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-pinner-test-",
  });
  const path = join(".ensemble", "kits", "build", "react");
  const kitDir = join(repoRoot, path);
  await Deno.mkdir(kitDir, { recursive: true });
  await Deno.writeTextFile(join(kitDir, "kit.yml"), manifestYaml);
  for (const [relativePath, content] of Object.entries(files)) {
    await Deno.writeTextFile(join(kitDir, relativePath), content);
  }

  await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
  await Deno.writeTextFile(
    join(repoRoot, "deno.lock"),
    JSON.stringify({ specifiers: { "jsr:@ensemble/kit-sdk@0.5.2": "0.5.2" } }),
  );

  const registry = new FileRegistry(repoRoot);
  await registry.register({
    repo: "https://example.com/react-kit.git",
    ref: "old-ref",
    path,
  });

  return {
    repoRoot,
    path,
    cleanup: () => Deno.remove(repoRoot, { recursive: true }),
  };
}

Deno.test("KitPinner.pin: moves the checkout to the new ref and updates the lockfile entry", async () => {
  const fixture = await withInstalledKit(`role: build\nkitSdk: "^0.5.0"\n`, {
    "main.ts": `export {};\n`,
  });
  try {
    const source = new FakePackageSource();
    source.refAfterSwitch = "new-ref-sha";
    const registry = new FileRegistry(fixture.repoRoot);
    const pinner = new KitPinner(fixture.repoRoot, registry, source);

    const entry = await pinner.pin(fixture.path, "v2.0.0");

    assertEquals(entry, {
      repo: "https://example.com/react-kit.git",
      ref: "new-ref-sha",
      path: fixture.path,
    });
    assertEquals(await registry.entryFor(fixture.path), entry);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitPinner.pin: rejects a path that isn't registered", async () => {
  const fixture = await withInstalledKit(`role: build\nkitSdk: "^0.5.0"\n`, {
    "main.ts": `export {};\n`,
  });
  try {
    const pinner = new KitPinner(
      fixture.repoRoot,
      new FileRegistry(fixture.repoRoot),
      new FakePackageSource(),
    );
    await assertRejects(
      () => pinner.pin(join(".ensemble", "kits", "build", "nope"), "v2.0.0"),
      Error,
      "isn't a registered vendored checkout",
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitPinner.pin: rejects when the new ref's entrypoint is missing", async () => {
  const fixture = await withInstalledKit(`role: pack\nkitSdk: "^0.5.0"\n`, {
    "main.ts": `export {};\n`,
  });
  try {
    const pinner = new KitPinner(
      fixture.repoRoot,
      new FileRegistry(fixture.repoRoot),
      new FakePackageSource(),
    );
    await assertRejects(
      () => pinner.pin(fixture.path, "v2.0.0"),
      Error,
      "publish.ts",
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitPinner.pin: rejects when the new ref's kitSdk is incompatible", async () => {
  const fixture = await withInstalledKit(`role: build\nkitSdk: "^1.0.0"\n`, {
    "main.ts": `export {};\n`,
  });
  try {
    const pinner = new KitPinner(
      fixture.repoRoot,
      new FileRegistry(fixture.repoRoot),
      new FakePackageSource(),
    );
    const error = await assertRejects(
      () => pinner.pin(fixture.path, "v2.0.0"),
      Error,
    );
    assert(error.message.includes("^1.0.0"));
    assert(error.message.includes("0.5.2"));
  } finally {
    await fixture.cleanup();
  }
});
