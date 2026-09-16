import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { LibPinner } from "./lib-pinner.ts";
import { LibUpdater } from "./lib-updater.ts";

class FakePackageSource implements PackageSource {
  refAfterSwitch = "unset";
  versions: string[] = [];

  fetch(): Promise<void> {
    throw new Error("not used by LibUpdater");
  }
  currentRef(): Promise<string> {
    return Promise.resolve(this.refAfterSwitch);
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by LibUpdater");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by LibUpdater");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by LibUpdater");
  }
  switchTo(): Promise<void> {
    return Promise.resolve();
  }
  availableVersions(): Promise<string[]> {
    return Promise.resolve(this.versions);
  }
}

async function withVendoredLib(
  pinnedRef: string,
): Promise<{ repoRoot: string; path: string; cleanup: () => Promise<void> }> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-updater-test-",
  });
  const path = join("source", "libs", "widgets");
  const libDir = join(repoRoot, path);
  await Deno.mkdir(libDir, { recursive: true });
  await Deno.writeTextFile(
    join(libDir, "deno.json"),
    JSON.stringify({ name: "@x/widgets" }),
  );
  await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });

  const registry = new FileRegistry(repoRoot);
  await registry.register({
    repo: "https://example.com/widgets.git",
    ref: pinnedRef,
    path,
  });

  return {
    repoRoot,
    path,
    cleanup: () => Deno.remove(repoRoot, { recursive: true }),
  };
}

Deno.test("LibUpdater.update: bumps to the next existing patch tag", async () => {
  const fixture = await withVendoredLib("1.2.3");
  try {
    const source = new FakePackageSource();
    source.versions = ["1.2.3", "1.2.4"];
    source.refAfterSwitch = "sha-for-1.2.4";
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new LibUpdater(
      registry,
      source,
      new LibPinner(fixture.repoRoot, registry, source),
    );

    const entry = await updater.update(fixture.path, "patch");

    assertEquals(entry, {
      repo: "https://example.com/widgets.git",
      ref: "sha-for-1.2.4",
      path: fixture.path,
    });
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("LibUpdater.update: rejects when the target tag doesn't exist upstream", async () => {
  const fixture = await withVendoredLib("1.2.3");
  try {
    const source = new FakePackageSource();
    source.versions = ["1.2.3"];
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new LibUpdater(
      registry,
      source,
      new LibPinner(fixture.repoRoot, registry, source),
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

Deno.test("LibUpdater.update: rejects when the pinned ref isn't a semver tag", async () => {
  const fixture = await withVendoredLib("main");
  try {
    const source = new FakePackageSource();
    const registry = new FileRegistry(fixture.repoRoot);
    const updater = new LibUpdater(
      registry,
      source,
      new LibPinner(fixture.repoRoot, registry, source),
    );

    await assertRejects(
      () => updater.update(fixture.path, "patch"),
      Error,
      "ens lib pin",
    );
  } finally {
    await fixture.cleanup();
  }
});
