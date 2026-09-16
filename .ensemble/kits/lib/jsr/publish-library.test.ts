import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { publishLibrary, type PublishRunner } from "./publish-library.ts";

class FakeRunner implements PublishRunner {
  calls: string[] = [];

  run(libRoot: string): Promise<void> {
    this.calls.push(libRoot);
    return Promise.resolve();
  }
}

async function withFixtureLib(
  initialDenoJson: Record<string, unknown>,
  run: (libRoot: string) => Promise<void>,
): Promise<void> {
  const libRoot = await Deno.makeTempDir({
    prefix: "ensemble-jsr-lib-kit-test-",
  });
  try {
    await Deno.writeTextFile(
      join(libRoot, "deno.json"),
      JSON.stringify(initialDenoJson),
    );
    await run(libRoot);
  } finally {
    await Deno.remove(libRoot, { recursive: true });
  }
}

Deno.test("publishLibrary: stamps deno.json with the resolved package/version, then hands off to the runner", async () => {
  await withFixtureLib({
    name: "@x/old-name",
    version: "0.0.1",
    exports: "./index.ts",
  }, async (libRoot) => {
    const runner = new FakeRunner();

    await publishLibrary(
      { libRoot, package: "@x/widgets", version: "1.2.3" },
      runner,
    );

    const denoJson = JSON.parse(
      await Deno.readTextFile(join(libRoot, "deno.json")),
    );
    assertEquals(denoJson, {
      name: "@x/widgets",
      version: "1.2.3",
      exports: "./index.ts",
    });
    assertEquals(runner.calls, [libRoot]);
  });
});

Deno.test("publishLibrary: never invokes the real deno publish command — the runner is the only publish call", async () => {
  await withFixtureLib(
    { name: "@x/widgets", version: "0.0.1" },
    async (libRoot) => {
      const runner = new FakeRunner();
      await publishLibrary({
        libRoot,
        package: "@x/widgets",
        version: "2.0.0",
        target: "public",
      }, runner);
      assertEquals(runner.calls.length, 1);
    },
  );
});
