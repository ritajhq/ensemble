import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import type * as KitSdk from "@ensemble/kit-sdk";
import { FileRegistry } from "./vendor/registry.ts";
import { SelfContainmentChecker } from "./lib-self-containment.ts";
import { LibDeclarationLoader } from "./lib-declaration.ts";
import { LibPublisher } from "./lib-publish.ts";
import type { LibKit } from "./lib-kit.ts";

class FakeLibKit {
  static stampCalls: { kit: string; input: KitSdk.Lib.Context }[] = [];
  static calls: { kit: string; input: KitSdk.Lib.Context }[] = [];

  constructor(private readonly kit: string) {}

  stamp(input: KitSdk.Lib.Context): Promise<void> {
    FakeLibKit.stampCalls.push({ kit: this.kit, input });
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

async function writeLib(
  repoRoot: string,
  name: string,
  libYml: string,
  imports: Record<string, string> = {},
): Promise<string> {
  const libRoot = join(repoRoot, "source", "libs", name);
  await Deno.mkdir(libRoot, { recursive: true });
  await Deno.writeTextFile(join(libRoot, "lib.yml"), libYml);
  await Deno.writeTextFile(
    join(libRoot, "deno.json"),
    JSON.stringify({ name: `@x/${name}`, imports }, null, 2),
  );
  return libRoot;
}

async function withRepoRoot(
  run: (repoRoot: string) => Promise<void>,
): Promise<void> {
  const repoRoot = await Deno.makeTempDir({
    prefix: "ensemble-lib-publish-test-",
  });
  try {
    await Deno.mkdir(join(repoRoot, ".ensemble"), { recursive: true });
    await run(repoRoot);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
}

function makePublisher(
  repoRoot: string,
  warnings: string[],
): { publisher: LibPublisher; registry: FileRegistry } {
  const registry = new FileRegistry(repoRoot);
  const publisher = new LibPublisher(
    repoRoot,
    new SelfContainmentChecker(repoRoot),
    registry,
    new LibDeclarationLoader(repoRoot),
    fakeLibKitFor,
    (message) => warnings.push(message),
  );
  return { publisher, registry };
}

Deno.test("LibPublisher.publish: an unejected lib warns but still publishes", async () => {
  await withRepoRoot(async (repoRoot) => {
    FakeLibKit.stampCalls = [];
    FakeLibKit.calls = [];
    await writeLib(
      repoRoot,
      "widgets",
      `package: "@x/widgets"\npublish:\n  - kit: jsr\n`,
    );
    const warnings: string[] = [];
    const { publisher } = makePublisher(repoRoot, warnings);

    await publisher.publish("widgets", "jsr", "1.0.0");

    assertEquals(warnings.length, 1);
    assertEquals(warnings[0].includes("hasn't been ejected"), true);
    const expectedInput = {
      kit: "jsr",
      input: {
        libRoot: join(repoRoot, "source", "libs", "widgets"),
        package: "@x/widgets",
        version: "1.0.0",
        target: undefined,
      },
    };
    assertEquals(FakeLibKit.stampCalls, [expectedInput]);
    assertEquals(FakeLibKit.calls, [expectedInput]);
  });
});

Deno.test("LibPublisher.publish: an ejected lib publishes silently, no warning", async () => {
  await withRepoRoot(async (repoRoot) => {
    FakeLibKit.stampCalls = [];
    FakeLibKit.calls = [];
    await writeLib(
      repoRoot,
      "widgets",
      `package: "@x/widgets"\npublish:\n  - kit: jsr\n`,
    );
    const warnings: string[] = [];
    const { publisher, registry } = makePublisher(repoRoot, warnings);
    await registry.register({
      repo: "https://example.com/widgets.git",
      ref: "abc123",
      path: "source/libs/widgets",
    });

    await publisher.publish("widgets", "jsr", "1.0.0");

    assertEquals(warnings, []);
    assertEquals(FakeLibKit.stampCalls.length, 1);
    assertEquals(FakeLibKit.calls.length, 1);
  });
});

Deno.test("LibPublisher.publish: a self-containment violation blocks publish even when ejected", async () => {
  await withRepoRoot(async (repoRoot) => {
    FakeLibKit.stampCalls = [];
    FakeLibKit.calls = [];
    await Deno.mkdir(join(repoRoot, "source", "core", "kit-sdk"), {
      recursive: true,
    });
    await Deno.writeTextFile(
      join(repoRoot, "source", "core", "kit-sdk", "deno.json"),
      JSON.stringify({ name: "@ensemble/kit-sdk" }),
    );
    await writeLib(
      repoRoot,
      "widgets",
      `package: "@x/widgets"\npublish:\n  - kit: jsr\n`,
      { "@ensemble/kit-sdk": "jsr:@ensemble/kit-sdk" },
    );
    const warnings: string[] = [];
    const { publisher, registry } = makePublisher(repoRoot, warnings);
    await registry.register({
      repo: "https://example.com/widgets.git",
      ref: "abc123",
      path: "source/libs/widgets",
    });

    await assertRejects(
      () => publisher.publish("widgets", "jsr", "1.0.0"),
      Error,
      "isn't self-contained enough to publish",
    );
    assertEquals(FakeLibKit.stampCalls, []);
    assertEquals(FakeLibKit.calls, []);
    assertEquals(warnings, []);
  });
});

Deno.test("LibPublisher.publish: publishing through an undeclared kit rejects", async () => {
  await withRepoRoot(async (repoRoot) => {
    FakeLibKit.stampCalls = [];
    FakeLibKit.calls = [];
    await writeLib(
      repoRoot,
      "widgets",
      `package: "@x/widgets"\npublish:\n  - kit: jsr\n`,
    );
    const warnings: string[] = [];
    const { publisher } = makePublisher(repoRoot, warnings);

    await assertRejects(
      () => publisher.publish("widgets", "npm", "1.0.0"),
      Error,
      'doesn\'t declare a "npm" entry',
    );
    assertEquals(FakeLibKit.stampCalls, []);
    assertEquals(FakeLibKit.calls, []);
  });
});
