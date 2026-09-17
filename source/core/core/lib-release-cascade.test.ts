import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import type * as Lib from "./lib-context.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { CoreLibReleaseCascade } from "./lib-release-cascade.ts";
import type { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";

/** `libKitFor` is always overridden by a fake in these tests, so the default's dependency on real ports never actually runs. */
const UNUSED_PORTS: Ports = {
  repo: { findRepoRoot: () => Promise.reject(new Error("not used")) },
  denoExe: { resolveDenoExecutable: () => Promise.reject(new Error("not used")) },
  process: {
    run: () => Promise.reject(new Error("not used")),
    exec: () => Promise.reject(new Error("not used")),
    capture: () => Promise.reject(new Error("not used")),
  },
};

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
  const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);

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
  const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);

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
  const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);

  await cascade.publish("1.0.0", [
    {
      libRoot: "/repo/source/core/website",
      declaration: { package: "@ensemble/website", publish: [] },
    },
  ]);

  assertEquals(FakeLibKit.publishCalls, []);
});

Deno.test("CoreLibReleaseCascade.stamp: repins a dependent core lib's imports on its sibling to the new version", async () => {
  FakeLibKit.stampCalls = [];
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-release-cascade-pin-",
  });
  try {
    const coreLibRoot = join(repoRoot, "source", "core", "core");
    const kitSdkLibRoot = join(repoRoot, "source", "core", "kit-sdk");
    await Deno.mkdir(coreLibRoot, { recursive: true });
    await Deno.mkdir(kitSdkLibRoot, { recursive: true });
    await Deno.writeTextFile(
      join(coreLibRoot, "deno.json"),
      JSON.stringify({ name: "@ensemble/core", version: "0.13.0" }) + "\n",
    );
    await Deno.writeTextFile(
      join(kitSdkLibRoot, "deno.json"),
      JSON.stringify({
        name: "@ensemble/kit-sdk",
        version: "0.13.0",
        imports: {
          "@ensemble/core": "jsr:@ensemble/core@^0.13.0",
          "@std/path": "jsr:@std/path@1.1.6",
        },
      }) + "\n",
    );

    const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);
    await cascade.stamp("0.14.0", [
      {
        libRoot: coreLibRoot,
        declaration: { package: "@ensemble/core", publish: [] },
      },
      {
        libRoot: kitSdkLibRoot,
        declaration: { package: "@ensemble/kit-sdk", publish: [] },
      },
    ]);

    const kitSdkDenoJson = JSON.parse(
      await Deno.readTextFile(join(kitSdkLibRoot, "deno.json")),
    );
    assertEquals(kitSdkDenoJson.imports, {
      "@ensemble/core": "jsr:@ensemble/core@^0.14.0",
      "@std/path": "jsr:@std/path@1.1.6",
    });

    // core's own version must already be bumped before kit-sdk's stamp
    // subprocess ever runs — otherwise that subprocess would see kit-sdk's
    // freshly repinned `^0.14.0` import next to a workspace copy of core
    // still on disk at 0.13.0, the same mismatch pinInterLibDependencies
    // exists to prevent, just aimed at core's own manifest instead.
    const coreDenoJson = JSON.parse(
      await Deno.readTextFile(join(coreLibRoot, "deno.json")),
    );
    assertEquals(coreDenoJson.version, "0.14.0");
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
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
      `publish:\n  core:\n    - name: kit-sdk\n      package: "@ensemble/kit-sdk"\n      publish:\n        - kit: jsr\n`,
    );

    const discovered = await new LibDeclarationLoader(repoRoot)
      .discoverCoreLibs();
    const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);
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
