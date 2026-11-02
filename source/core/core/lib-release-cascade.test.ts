import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import type * as Lib from "./lib-context.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { CoreLibReleaseCascade } from "./lib-release-cascade.ts";
import type { LibKit } from "./lib-kit.ts";
import type { Ports } from "./ports.ts";
import type { Authorization, PublishCheck } from "./publish-authorization.ts";

/** `libKitFor` is always overridden by a fake in these tests, so the default's dependency on real ports never actually runs. */
const UNUSED_PORTS: Ports = {
  repo: { findRepoRoot: () => Promise.reject(new Error("not used")) },
  denoExe: {
    resolveDenoExecutable: () => Promise.reject(new Error("not used")),
  },
  process: {
    run: () => Promise.reject(new Error("not used")),
    exec: () => Promise.reject(new Error("not used")),
    capture: () => Promise.reject(new Error("not used")),
    probe: () => Promise.reject(new Error("not used")),
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

  // "npm" refuses straight away, every other kit grants after a short wait —
  // so a cascade checking one entry after another would report them in
  // declaration order, while one checking them all at once can't.
  authorize(): Promise<Authorization> {
    if (this.kit === "npm") {
      return Promise.resolve({ granted: false, reason: "token is read-only" });
    }
    return new Promise((resolve) =>
      setTimeout(() => resolve({ granted: true }), 20)
    );
  }
}

const IDLE_WORKSPACE = {
  stamp: () => Promise.resolve([]),
  lockfiles: () => Promise.resolve([]),
};

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
  ], IDLE_WORKSPACE);

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

Deno.test("CoreLibReleaseCascade.authorize: checks every entry at once, reporting each as it lands and returning the refusals", async () => {
  const cascade = new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor);
  const checks: PublishCheck[] = [];

  const denials = await cascade.authorize(
    "1.2.3",
    [
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
    ],
    (check) => checks.push(check),
  );

  assertEquals(checks, [
    {
      publish: "@ensemble/kit-sdk → npm",
      granted: false,
      reason: "token is read-only",
    },
    { publish: "@ensemble/kit-sdk → jsr", granted: true },
  ]);
  assertEquals(denials, [
    { publish: "@ensemble/kit-sdk → npm", reason: "token is read-only" },
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

Deno.test("CoreLibReleaseCascade.stamp: the workspace moves before any lib kit runs, and its changes are reported", async () => {
  FakeLibKit.stampCalls = [];
  const order: string[] = [];
  const workspace = {
    stamp: (version: string, targets: readonly { name: string }[]) => {
      order.push(`workspace ${version} ${targets.map((t) => t.name).join()}`);
      assertEquals(FakeLibKit.stampCalls, []);
      return Promise.resolve(["/repo/kits/docker/deno.json"]);
    },
    lockfiles: () => Promise.resolve(["/repo/deno.lock"]),
  };

  const changed = await new CoreLibReleaseCascade(UNUSED_PORTS, fakeLibKitFor)
    .stamp(
      "0.14.0",
      [{
        libRoot: "/repo/source/core/core",
        declaration: {
          package: "@ensemble/core",
          publish: [{ kit: "jsr" }],
        },
      }],
      workspace,
    );

  assertEquals(order, ["workspace 0.14.0 @ensemble/core"]);
  assertEquals(FakeLibKit.stampCalls.length, 1);
  assertEquals(changed, ["/repo/kits/docker/deno.json", "/repo/deno.lock"]);
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
