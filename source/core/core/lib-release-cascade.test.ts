import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import type * as Lib from "./lib-context.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { CoreLibReleaseCascade } from "./lib-release-cascade.ts";
import type { LibKit } from "./lib-kit.ts";

class FakeLibKit {
  static stampCalls: { kit: string; input: Lib.Context }[] = [];
  static publishCalls: { kit: string; input: Lib.Context }[] = [];

  constructor(private readonly kit: string) {}

  stamp(input: Lib.Context): Promise<void> {
    FakeLibKit.stampCalls.push({ kit: this.kit, input });
    return Promise.resolve();
  }

  publish(input: Lib.Context): Promise<void> {
    FakeLibKit.publishCalls.push({ kit: this.kit, input });
    return Promise.resolve();
  }
}

function fakeLibKitFor(kit: string): LibKit {
  return new FakeLibKit(kit) as unknown as LibKit;
}

Deno.test("CoreLibReleaseCascade.stamp: stamps each declared entry under the given version", async () => {
  FakeLibKit.stampCalls = [];
  const cascade = new CoreLibReleaseCascade(fakeLibKitFor);

  await cascade.stamp("1.2.3", [
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

  assertEquals(FakeLibKit.stampCalls, [
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

Deno.test("CoreLibReleaseCascade.publish: publishes each declared entry under the given version", async () => {
  FakeLibKit.publishCalls = [];
  const cascade = new CoreLibReleaseCascade(fakeLibKitFor);

  await cascade.publish("1.2.3", [
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

  assertEquals(FakeLibKit.publishCalls, [
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

Deno.test("CoreLibReleaseCascade.publish: a library with no publish entries publishes nothing", async () => {
  FakeLibKit.publishCalls = [];
  const cascade = new CoreLibReleaseCascade(fakeLibKitFor);

  await cascade.publish("1.0.0", [
    {
      libRoot: "/repo/source/core/website",
      declaration: { package: "@ensemble/website", publish: [] },
    },
  ]);

  assertEquals(FakeLibKit.publishCalls, []);
});

Deno.test("worked example: a discovered core lib publishes alongside ships under the same computed version", async () => {
  FakeLibKit.publishCalls = [];
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-release-cascade-worked-example-",
  });
  try {
    const libRoot = join(repoRoot, "source", "core", "kit-sdk");
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "config.yaml"),
      `coreLibs:\n  kit-sdk:\n    package: "@ensemble/kit-sdk"\n    publish:\n      - kit: jsr\n`,
    );

    const discovered = await new LibDeclarationLoader(repoRoot)
      .discoverCoreLibs();
    const cascade = new CoreLibReleaseCascade(fakeLibKitFor);
    const sharedVersion = "2.0.0"; // the same version a ship cascade in the same release run would use
    await cascade.publish(sharedVersion, discovered);

    assertEquals(FakeLibKit.publishCalls, [
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
