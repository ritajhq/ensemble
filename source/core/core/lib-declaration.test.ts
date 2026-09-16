import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { LibDeclarationLoader } from "./lib-declaration.ts";

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-declaration-test-",
  });
  try {
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

async function writeLibYml(libRoot: string, content: string): Promise<void> {
  await Deno.mkdir(libRoot, { recursive: true });
  await Deno.writeTextFile(join(libRoot, "lib.yml"), content);
}

Deno.test("LibDeclarationLoader.load: parses package and publish entries", async () => {
  await withRepoRoot(async (repoRoot) => {
    const libRoot = join(repoRoot, "source", "core", "kit-sdk");
    await writeLibYml(
      libRoot,
      `package: "@ensemble/kit-sdk"\npublish:\n  - kit: jsr\n  - kit: npm\n    target: private-registry\n`,
    );

    const declaration = await new LibDeclarationLoader(repoRoot).load(libRoot);
    assertEquals(declaration, {
      package: "@ensemble/kit-sdk",
      publish: [{ kit: "jsr", target: undefined }, {
        kit: "npm",
        target: "private-registry",
      }],
    });
  });
});

Deno.test("LibDeclarationLoader.load: a lib.yml with no publish entries loads with an empty list", async () => {
  await withRepoRoot(async (repoRoot) => {
    const libRoot = join(repoRoot, "source", "libs", "widgets");
    await writeLibYml(libRoot, `package: "widgets"\n`);

    const declaration = await new LibDeclarationLoader(repoRoot).load(libRoot);
    assertEquals(declaration, { package: "widgets", publish: [] });
  });
});

Deno.test("LibDeclarationLoader.load: missing package name rejected", async () => {
  await withRepoRoot(async (repoRoot) => {
    const libRoot = join(repoRoot, "source", "libs", "widgets");
    await writeLibYml(libRoot, `publish: []\n`);

    await assertRejects(
      () => new LibDeclarationLoader(repoRoot).load(libRoot),
      Error,
      'missing a "package"',
    );
  });
});

async function writeConfigYaml(repoRoot: string, content: string): Promise<void> {
  await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
  await Deno.writeTextFile(join(repoRoot, ".ensemble", "config.yaml"), content);
}

Deno.test("LibDeclarationLoader.discoverCoreLibs: finds every entry under libs: in .ensemble/config.yaml, resolved against source/core/<name>", async () => {
  await withRepoRoot(async (repoRoot) => {
    await writeConfigYaml(
      repoRoot,
      `libs:\n  kit-sdk:\n    package: "@ensemble/kit-sdk"\n  core:\n    package: "@ensemble/core"\n    publish:\n      - kit: jsr\n`,
    );
    // "website" isn't declared under libs: — never discovered.
    await Deno.mkdir(join(repoRoot, "source", "core", "website"), {
      recursive: true,
    });

    const discovered = await new LibDeclarationLoader(repoRoot)
      .discoverCoreLibs();
    assertEquals(discovered.length, 2);
    const byPackage = new Map(
      discovered.map((d) => [d.declaration.package, d]),
    );
    assertEquals(byPackage.get("@ensemble/kit-sdk")?.declaration.publish, []);
    assertEquals(byPackage.get("@ensemble/core")?.declaration.publish, [{
      kit: "jsr",
      target: undefined,
    }]);
    assertEquals(
      byPackage.get("@ensemble/kit-sdk")?.libRoot,
      join(repoRoot, "source", "core", "kit-sdk"),
    );
  });
});

Deno.test("LibDeclarationLoader.discoverCoreLibs: no .ensemble/config.yaml discovers nothing", async () => {
  await withRepoRoot(async (repoRoot) => {
    assertEquals(
      await new LibDeclarationLoader(repoRoot).discoverCoreLibs(),
      [],
    );
  });
});

Deno.test("LibDeclarationLoader.discoverCoreLibs: a libs entry missing a package name rejects", async () => {
  await withRepoRoot(async (repoRoot) => {
    await writeConfigYaml(repoRoot, `libs:\n  kit-sdk: {}\n`);

    await assertRejects(
      () => new LibDeclarationLoader(repoRoot).discoverCoreLibs(),
      Error,
      'missing a "package"',
    );
  });
});
