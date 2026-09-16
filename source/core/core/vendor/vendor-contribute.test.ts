import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { FileRegistry } from "./registry.ts";
import type { PackageSource, PullRequestRef } from "./package-source.ts";
import { VendorContribute } from "./vendor-contribute.ts";

class FakePackageSource implements PackageSource {
  calls: { method: string; args: unknown[] }[] = [];

  fetch(): Promise<void> {
    throw new Error("not used by VendorContribute");
  }
  currentRef(): Promise<string> {
    throw new Error("not used by VendorContribute");
  }
  flattenHistory(): Promise<void> {
    throw new Error("not used by VendorContribute");
  }
  publishTo(): Promise<string> {
    throw new Error("not used by VendorContribute");
  }
  proposeChange(dir: string): Promise<PullRequestRef> {
    this.calls.push({ method: "proposeChange", args: [dir] });
    return Promise.resolve({ url: "https://example.com/pr/1" });
  }
  switchTo(): Promise<void> {
    throw new Error("not used by VendorContribute");
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used by VendorContribute");
  }
}

async function withRegisteredCheckout(
  run: (repoRoot: string, path: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-vendor-contribute-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const path = ".ensemble/kits/build/react";
    await new FileRegistry(repoRoot).register({
      repo: "https://example.com/react-kit.git",
      ref: "abc123",
      path,
    });
    await run(repoRoot, path);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("VendorContribute.contribute: proposes the checkout's local change upstream", async () => {
  await withRegisteredCheckout(async (repoRoot, path) => {
    const source = new FakePackageSource();
    const contribute = new VendorContribute(
      repoRoot,
      new FileRegistry(repoRoot),
      source,
    );

    const pr = await contribute.contribute(path);

    assertEquals(pr, { url: "https://example.com/pr/1" });
    assertEquals(source.calls, [{
      method: "proposeChange",
      args: [join(repoRoot, path)],
    }]);
  });
});

Deno.test("VendorContribute.contribute: rejects an unregistered path without touching the source", async () => {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-vendor-contribute-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    const source = new FakePackageSource();
    const contribute = new VendorContribute(
      repoRoot,
      new FileRegistry(repoRoot),
      source,
    );

    await assertRejects(
      () => contribute.contribute("not/registered"),
      Error,
      "isn't a registered vendored checkout",
    );
    assertEquals(source.calls, []);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
