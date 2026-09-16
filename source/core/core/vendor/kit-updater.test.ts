import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { KitPinner } from "./kit-pinner.ts";
import { KitUpdater } from "./kit-updater.ts";

class FakePackageSource implements PackageSource {
  refAfterSwitch = "unset";
  versions: string[] = [];

  fetch(): Promise<void> {
    throw new Error("not used by KitUpdater");
  }
  currentRef(): Promise<string> {
    return Promise.resolve(this.refAfterSwitch);
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by KitUpdater");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by KitUpdater");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by KitUpdater");
  }
  switchTo(): Promise<void> {
    return Promise.resolve();
  }
  availableVersions(): Promise<string[]> {
    return Promise.resolve(this.versions);
  }
}

async function withInstalledKit(
  pinnedRef: string,
): Promise<{ repoRoot: string; path: string; cleanup: () => Promise<void> }> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-kit-updater-test-",
  });
  const path = join(".ensemble", "kits", "build", "react");
  const kitDir = join(repoRoot, path);
  await Deno.mkdir(kitDir, { recursive: true });
  await Deno.writeTextFile(
    join(kitDir, "kit.yml"),
    `role: build\nkitSdk: "^0.5.0"\n`,
  );
  await Deno.writeTextFile(join(kitDir, "main.ts"), `export {};\n`);

  await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
  await Deno.writeTextFile(
    join(repoRoot, "deno.lock"),
    JSON.stringify({ specifiers: { "jsr:@ensemble/kit-sdk@0.5.2": "0.5.2" } }),
  );

  const registry = new FileRegistry(repoRoot);
  await registry.register({
    repo: "https://example.com/react-kit.git",
    ref: pinnedRef,
    path,
  });

  return {
    repoRoot,
    path,
    cleanup: () => Deno.remove(repoRoot, { recursive: true }),
  };
}

Deno.test("KitUpdater.update: defaults-equivalent explicit patch bumps to the next existing patch tag", async () => {
  const fixture = await withInstalledKit("1.2.3");
  try {
    const source = new FakePackageSource();
    source.versions = ["1.2.3", "1.2.4", "1.3.0"];
    source.refAfterSwitch = "sha-for-1.2.4";
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new KitUpdater(
      registry,
      source,
      new KitPinner(fixture.repoRoot, registry, source),
    );

    const entry = await updater.update(fixture.path, "patch");

    assertEquals(entry, {
      repo: "https://example.com/react-kit.git",
      ref: "sha-for-1.2.4",
      path: fixture.path,
    });
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitUpdater.update: minor and major compute the expected target tag", async () => {
  const fixture = await withInstalledKit("v1.2.3");
  try {
    const source = new FakePackageSource();
    source.versions = ["v1.2.3", "v1.3.0", "v2.0.0"];
    source.refAfterSwitch = "sha";
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new KitUpdater(
      registry,
      source,
      new KitPinner(fixture.repoRoot, registry, source),
    );

    await updater.update(fixture.path, "minor");
    assertEquals((await registry.entryFor(fixture.path))?.ref, "sha");

    // Re-pin the fixture's ref back to v1.2.3 to test major in isolation.
    await registry.register({
      repo: "https://example.com/react-kit.git",
      ref: "v1.2.3",
      path: fixture.path,
    });
    await updater.update(fixture.path, "major");
    assertEquals((await registry.entryFor(fixture.path))?.ref, "sha");
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitUpdater.update: rejects when the target tag doesn't exist upstream", async () => {
  const fixture = await withInstalledKit("1.2.3");
  try {
    const source = new FakePackageSource();
    source.versions = ["1.2.3"]; // no 1.2.4 published
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new KitUpdater(
      registry,
      source,
      new KitPinner(fixture.repoRoot, registry, source),
    );

    await assertRejects(
      () => updater.update(fixture.path, "patch"),
      Error,
      '"1.2.4"',
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("KitUpdater.update: rejects when the pinned ref isn't a semver tag", async () => {
  const fixture = await withInstalledKit("main");
  try {
    const source = new FakePackageSource();
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new KitUpdater(
      registry,
      source,
      new KitPinner(fixture.repoRoot, registry, source),
    );

    await assertRejects(
      () => updater.update(fixture.path, "patch"),
      Error,
      "ens kit pin",
    );
  } finally {
    await fixture.cleanup();
  }
});
