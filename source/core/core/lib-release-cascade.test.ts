import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { CoreLibReleaseCascade } from "./lib-release-cascade.ts";
import type { LibKit } from "./lib-kit.ts";

class FakeLibKit {
  static calls: { kit: string; input: KitSdk.Lib.Context }[] = [];

  constructor(private readonly kit: string) {}

  publish(input: KitSdk.Lib.Context): Promise<void> {
    FakeLibKit.calls.push({ kit: this.kit, input });
    return Promise.resolve();
  }
}

function fakeLibKitFor(kit: string): LibKit {
  return new FakeLibKit(kit) as unknown as LibKit;
}

Deno.test("CoreLibReleaseCascade.cascade: publishes each declared entry under the given version", async () => {
  FakeLibKit.calls = [];
  const cascade = new CoreLibReleaseCascade(fakeLibKitFor);

  await cascade.cascade("1.2.3", [
    {
      libRoot: "/repo/source/core/kit-sdk",
      declaration: {
        package: "@ensemble/kit-sdk",
        publish: [{ kit: "jsr", target: undefined }, {
          kit: "npm",
          target: "private-registry",
        }],
      },
    },
  ]);

  assertEquals(FakeLibKit.calls, [
    {
      kit: "jsr",
      input: {
        libRoot: "/repo/source/core/kit-sdk",
        package: "@ensemble/kit-sdk",
        version: "1.2.3",
        target: undefined,
      },
    },
    {
      kit: "npm",
      input: {
        libRoot: "/repo/source/core/kit-sdk",
        package: "@ensemble/kit-sdk",
        version: "1.2.3",
        target: "private-registry",
      },
    },
  ]);
});

Deno.test("CoreLibReleaseCascade.cascade: a library with no publish entries publishes nothing", async () => {
  FakeLibKit.calls = [];
  const cascade = new CoreLibReleaseCascade(fakeLibKitFor);

  await cascade.cascade("1.0.0", [
    {
      libRoot: "/repo/source/core/website",
      declaration: { package: "@ensemble/website", publish: [] },
    },
  ]);

  assertEquals(FakeLibKit.calls, []);
});

Deno.test("worked example: a discovered core lib publishes alongside ships under the same computed version", async () => {
  FakeLibKit.calls = [];
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-release-cascade-worked-example-",
  });
  try {
    const libRoot = join(repoRoot, "source", "core", "kit-sdk");
    await Deno.mkdir(libRoot, { recursive: true });
    await Deno.writeTextFile(
      join(libRoot, "lib.yml"),
      `package: "@ensemble/kit-sdk"\npublish:\n  - kit: jsr\n`,
    );

    const discovered = await new LibDeclarationLoader(repoRoot)
      .discoverCoreLibs();
    const cascade = new CoreLibReleaseCascade(fakeLibKitFor);
    const sharedVersion = "2.0.0"; // the same version a ship cascade in the same release run would use
    await cascade.cascade(sharedVersion, discovered);

    assertEquals(FakeLibKit.calls, [
      {
        kit: "jsr",
        input: {
          libRoot,
          package: "@ensemble/kit-sdk",
          version: sharedVersion,
          target: undefined,
        },
      },
    ]);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
