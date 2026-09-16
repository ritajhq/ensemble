import { join } from "@std/path";
import { assert, assertEquals, assertRejects } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { runLibNew } from "./lib-scaffold.ts";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { LibEjector } from "./lib-eject.ts";
import { LibPublisher } from "./lib-publish.ts";
import { CoreLibReleaseCascade } from "./lib-release-cascade.ts";
import { ReleaseCeremony } from "./release.ts";
import type { LibKit } from "./lib-kit.ts";
import type { PackageSource, PullRequestRef } from "./vendor/package-source.ts";
import { FileRegistry } from "./vendor/registry.ts";

class FakeLibKit {
  static calls: { kit: string; input: KitSdk.Lib.Context }[] = [];

  constructor(private readonly kit: string) {}

  stamp(_input: KitSdk.Lib.Context): Promise<void> {
    return Promise.resolve();
  }

  publish(input: KitSdk.Lib.Context): Promise<void> {
    FakeLibKit.calls.push({ kit: this.kit, input });
    return Promise.resolve();
  }
}

function fakeLibKitFor(kit: string): LibKit {
  return new FakeLibKit(kit) as unknown as LibKit;
}

class FakePackageSource implements PackageSource {
  calls: { method: string; args: unknown[] }[] = [];

  fetch(): Promise<void> {
    throw new Error("not used in this worked example");
  }
  currentRef(): Promise<string> {
    throw new Error("not used in this worked example");
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
    throw new Error("not used in this worked example");
  }
  switchTo(): Promise<void> {
    throw new Error("not used in this worked example");
  }
  availableVersions(): Promise<string[]> {
    throw new Error("not used in this worked example");
  }
}

// findRepoRoot walks up from Deno.cwd() before ever consulting
// ENSEMBLE_WORKSPACE, so this test — itself running inside the real
// ensemble checkout — must actually chdir into the fixture project (which
// has its own ".ensemble") for runLibNew's internal findRepoRoot() call to
// resolve there instead of walking up into the real repo.
async function withProjectRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-worked-example-",
  });
  const previousCwd = Deno.cwd();
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    Deno.chdir(repoRoot);
    try {
      await run(repoRoot);
    } finally {
      Deno.chdir(previousCwd);
    }
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

Deno.test("worked example (core-lib path): a discovered core lib shares the same computed version as ships, with no self-containment check involved", async () => {
  FakeLibKit.calls = [];
  await withProjectRoot(async (repoRoot) => {
    // The fixture "ship": a delivery manifest declaring a release — proves
    // ships and core libs are discovered side by side, not one replacing
    // the other's discovery step.
    await Deno.mkdir(join(repoRoot, "ci", "demo"), { recursive: true });
    await Deno.writeTextFile(
      join(repoRoot, "ci", "demo", "delivery.yml"),
      `version: v1\nrelease:\n  web:\n    kit: docker\n`,
    );

    // The fixture core lib, declared in .ensemble/config.yaml (already
    // created by withProjectRoot) rather than a lib.yml alongside it.
    const libRoot = join(repoRoot, "source", "core", "kit-sdk");
    await Deno.writeTextFile(
      join(repoRoot, ".ensemble", "config.yaml"),
      `libs:\n  kit-sdk:\n    package: "@ensemble/kit-sdk"\n    publish:\n      - kit: fake\n`,
    );

    const ceremony = new ReleaseCeremony(repoRoot);

    const ships = await ceremony.collectShipReleases();
    assertEquals(ships.map((s) => s.name), ["web"]);

    const coreLibs = await ceremony.collectCoreLibReleases();
    assertEquals(coreLibs.map((l) => l.declaration.package), [
      "@ensemble/kit-sdk",
    ]);

    // Same computed version a ship cascade in the same release run would use.
    const sharedVersion = "3.1.4";
    await new CoreLibReleaseCascade(fakeLibKitFor).publish(
      sharedVersion,
      coreLibs,
    );

    assertEquals(FakeLibKit.calls, [
      {
        kit: "fake",
        input: {
          libRoot,
          package: "@ensemble/kit-sdk",
          version: sharedVersion,
          target: undefined,
        },
      },
    ]);

    // Structural confirmation this path never touches SelfContainmentChecker:
    // neither ReleaseCeremony.collectCoreLibReleases/releaseCoreLibs nor
    // CoreLibReleaseCascade import or hold a reference to it at all — there
    // is nothing here that could invoke `.check()`, not even one that
    // chooses not to.
  });
});

Deno.test("worked example (libs-library path): scaffold, publish unejected (warns), violate, eject blocked, fix, eject succeeds, publish ejected (no warning)", async () => {
  FakeLibKit.calls = [];
  await withProjectRoot(async (repoRoot) => {
    const libRoot = join(repoRoot, "source", "libs", "widgets");
    const registry = new FileRegistry(repoRoot);
    const checker = new SelfContainmentChecker(repoRoot);
    const declarationLoader = new LibDeclarationLoader(repoRoot);

    // 1. Scaffold the fixture lib.
    await runLibNew("widgets");

    // Give it a publish entry — the bare scaffold declares none yet.
    await Deno.writeTextFile(
      join(libRoot, "lib.yml"),
      `package: "widgets"\npublish:\n  - kit: fake\n`,
    );

    // 2. Publish it, still unejected, before any violation exists — earlier
    // in this fixture flow than the eject attempts below.
    const earlyWarnings: string[] = [];
    const earlyPublisher = new LibPublisher(
      repoRoot,
      checker,
      registry,
      declarationLoader,
      fakeLibKitFor,
      (message) => earlyWarnings.push(message),
    );
    await earlyPublisher.publish("widgets", "fake", "0.1.0");
    assertEquals(earlyWarnings.length, 1);
    assert(earlyWarnings[0].includes("hasn't been ejected"));
    assertEquals(FakeLibKit.calls, [
      {
        kit: "fake",
        input: {
          libRoot,
          package: "widgets",
          version: "0.1.0",
          target: undefined,
        },
      },
    ]);

    // 3. Introduce a violation: widgets imports from source/core.
    await Deno.mkdir(join(repoRoot, "source", "core", "kit-sdk"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, "source", "core", "kit-sdk", "deno.json"),
      JSON.stringify({ name: "@ensemble/kit-sdk" }),
    );
    const denoJsonPath = join(libRoot, "deno.json");
    const violatingDenoJson = {
      name: "widgets",
      version: "0.0.1",
      exports: "./index.ts",
      imports: { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" },
    };
    await Deno.writeTextFile(
      denoJsonPath,
      JSON.stringify(violatingDenoJson, null, 2),
    );

    // 4. Eject aborts, naming the violation, before any git operation.
    const gateway = new FakePackageSource();
    const ejector = new LibEjector(repoRoot, checker, registry, gateway);
    const ejectError = await assertRejects(
      () => ejector.eject("widgets", "https://example.com/widgets.git"),
      Error,
      "isn't self-contained enough to eject",
    );
    assert(ejectError.message.includes("@ensemble/kit-sdk"));
    assertEquals(gateway.calls, []);

    // 5. Fix: drop the offending import.
    await Deno.writeTextFile(
      denoJsonPath,
      JSON.stringify(
        {
          name: "widgets",
          version: "0.0.1",
          exports: "./index.ts",
          imports: {},
        },
        null,
        2,
      ),
    );

    // 6. Eject now succeeds and registers a vendor entry.
    const entry = await ejector.eject(
      "widgets",
      "https://example.com/widgets.git",
    );
    assertEquals(entry, {
      repo: "https://example.com/widgets.git",
      ref: "deadbeef",
      path: "source/libs/widgets",
    });
    assertEquals(await registry.entryFor("source/libs/widgets"), entry);

    // 7. Publish again, now ejected: no warning this time.
    FakeLibKit.calls = [];
    const laterWarnings: string[] = [];
    const laterPublisher = new LibPublisher(
      repoRoot,
      checker,
      registry,
      declarationLoader,
      fakeLibKitFor,
      (message) => laterWarnings.push(message),
    );
    await laterPublisher.publish("widgets", "fake", "0.2.0");
    assertEquals(laterWarnings, []);
    assertEquals(FakeLibKit.calls, [
      {
        kit: "fake",
        input: {
          libRoot,
          package: "widgets",
          version: "0.2.0",
          target: undefined,
        },
      },
    ]);
  });
});
