import { join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { LibPinner } from "./lib-pinner.ts";

class FakePackageSource implements PackageSource {
  refAfterSwitch = "unset";

  fetch(): Promise<void> {
    throw new Error("not used by LibPinner");
  }
  currentRef(): Promise<string> {
    return Promise.resolve(this.refAfterSwitch);
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by LibPinner");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by LibPinner");
  }
  proposeChange(): Promise<PullRequestRef> {
    throw new Error("not used by LibPinner");
  }
  switchTo(): Promise<void> {
    return Promise.resolve();
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by LibPinner");
  }
}

async function withVendoredLib(
  imports: Record<string, string> = {},
): Promise<{ repoRoot: string; path: string; cleanup: () => Promise<void> }> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-pinner-test-",
  });
  const path = join("source", "libs", "widgets");
  const libDir = join(repoRoot, path);
  await Deno.mkdir(libDir, { recursive: true });
  await Deno.writeTextFile(
    join(libDir, "deno.json"),
    JSON.stringify({ name: "@x/widgets", imports }),
  );
  await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });

  const registry = new FileRegistry(repoRoot);
  await registry.register({
    repo: "https://example.com/widgets.git",
    ref: "old-ref",
    path,
  });

  return {
    repoRoot,
    path,
    cleanup: () => Deno.remove(repoRoot, { recursive: true }),
  };
}

Deno.test("LibPinner.pin: moves the checkout to the new ref and updates the lockfile entry", async () => {
  const fixture = await withVendoredLib();
  try {
    const source = new FakePackageSource();
    source.refAfterSwitch = "new-ref-sha";
    const registry = new FileRegistry(fixture.repoRoot);
    const pinner = new LibPinner(fixture.repoRoot, registry, source);

    const entry = await pinner.pin(fixture.path, "v2.0.0");

    assertEquals(entry, {
      repo: "https://example.com/widgets.git",
      ref: "new-ref-sha",
      path: fixture.path,
    });
    assertEquals(await registry.entryFor(fixture.path), entry);
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("LibPinner.pin: rejects a path that isn't registered", async () => {
  const fixture = await withVendoredLib();
  try {
    const pinner = new LibPinner(
      fixture.repoRoot,
      new FileRegistry(fixture.repoRoot),
      new FakePackageSource(),
    );
    await assertRejects(
      () => pinner.pin(join("source", "libs", "nope"), "v2.0.0"),
      Error,
      "isn't a registered vendored checkout",
    );
  } finally {
    await fixture.cleanup();
  }
});

Deno.test("LibPinner.pin: rejects when the new ref introduces a self-containment violation", async () => {
  const fixture = await withVendoredLib({
    "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk",
  });
  try {
    await Deno.mkdir(join(fixture.repoRoot, "source", "core", "kit-sdk"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(fixture.repoRoot, "source", "core", "kit-sdk", "deno.json"),
      JSON.stringify({ name: "@ensemble/kit-sdk" }),
    );

    const pinner = new LibPinner(
      fixture.repoRoot,
      new FileRegistry(fixture.repoRoot),
      new FakePackageSource(),
    );
    const error = await assertRejects(
      () => pinner.pin(fixture.path, "v2.0.0"),
      Error,
    );
    assert(error.message.includes("isn't self-contained enough"));
    assert(error.message.includes("@ensemble/kit-sdk"));
  } finally {
    await fixture.cleanup();
  }
});
