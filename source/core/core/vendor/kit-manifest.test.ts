import { join } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import * as KitManifest from "./kit-manifest.ts";

async function withKitDir(
  yamlContent: string | undefined,
  run: (kitDir: string) => Promise<void>,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "ensemble-kit-manifest-test-" });
  try {
    if (yamlContent !== undefined) {
      await Deno.writeTextFile(join(dir, "kit.yml"), yamlContent);
    }
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("KitManifest.read: valid manifest", async () => {
  await withKitDir(`role: pack\nprotocol: 1\n`, async (kitDir) => {
    const manifest = await KitManifest.read(kitDir);
    assertEquals(manifest, { role: "pack", protocol: 1, publishes: false });
  });
});

Deno.test("KitManifest.read: unknown role rejected", async () => {
  await withKitDir(`role: nonsense\nprotocol: 1\n`, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "invalid");
  });
});

Deno.test("KitManifest.read: missing protocol rejected", async () => {
  await withKitDir(`role: build\n`, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "protocol");
  });
});

Deno.test("KitManifest.read: a protocol this ens doesn't speak rejected", async () => {
  await withKitDir(`role: build\nprotocol: 99\n`, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "protocol 99");
  });
});

Deno.test("KitManifest.read: declared publish targets are noted", async () => {
  await withKitDir(
    `role: pack\nprotocol: 1\npublish:\n  push: "Push it."\n`,
    async (kitDir) => {
      assertEquals((await KitManifest.read(kitDir)).publishes, true);
    },
  );
});

Deno.test("KitManifest.assertRunnable: a kit declaring no protocol, or with no manifest, still runs", async () => {
  await withKitDir(`modes:\n  image: image\n`, async (kitDir) => {
    await KitManifest.assertRunnable(kitDir);
  });
  await withKitDir(undefined, async (kitDir) => {
    await KitManifest.assertRunnable(kitDir);
  });
});

Deno.test("KitManifest.assertRunnable: a protocol this ens doesn't speak is refused", async () => {
  await withKitDir(`protocol: 99\n`, async (kitDir) => {
    await assertRejects(
      () => KitManifest.assertRunnable(kitDir),
      Error,
      "protocol 99",
    );
  });
});

Deno.test("KitManifest.read: missing manifest file rejected", async () => {
  await withKitDir(undefined, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "not found");
  });
});

Deno.test("KitManifest.requiredEntrypoints: a kit that publishes needs publish.ts too", () => {
  assertEquals(KitManifest.requiredEntrypoints({ publishes: true }), [
    "main.ts",
    "publish.ts",
  ]);
});

Deno.test("KitManifest.requiredEntrypoints: any other kit needs only main.ts", () => {
  assertEquals(KitManifest.requiredEntrypoints({ publishes: false }), [
    "main.ts",
  ]);
});
