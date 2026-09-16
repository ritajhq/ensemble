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
  await withKitDir(`role: pack\nkitSdk: "^0.5.0"\n`, async (kitDir) => {
    const manifest = await KitManifest.read(kitDir);
    assertEquals(manifest, { role: "pack", kitSdk: "^0.5.0" });
  });
});

Deno.test("KitManifest.read: unknown role rejected", async () => {
  await withKitDir(`role: nonsense\nkitSdk: "^0.5.0"\n`, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "invalid");
  });
});

Deno.test("KitManifest.read: missing kitSdk rejected", async () => {
  await withKitDir(`role: build\n`, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "kitSdk");
  });
});

Deno.test("KitManifest.read: missing manifest file rejected", async () => {
  await withKitDir(undefined, async (kitDir) => {
    await assertRejects(() => KitManifest.read(kitDir), Error, "not found");
  });
});

Deno.test("KitManifest.requiredEntrypoints: pack requires main.ts and publish.ts", () => {
  assertEquals(KitManifest.requiredEntrypoints("pack"), [
    "main.ts",
    "publish.ts",
  ]);
});

Deno.test("KitManifest.requiredEntrypoints: build/deploy/lib require only main.ts", () => {
  assertEquals(KitManifest.requiredEntrypoints("build"), ["main.ts"]);
  assertEquals(KitManifest.requiredEntrypoints("deploy"), ["main.ts"]);
  assertEquals(KitManifest.requiredEntrypoints("lib"), ["main.ts"]);
});
