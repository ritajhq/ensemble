import { fromFileUrl } from "@std/path";
import { assertEquals, assertRejects } from "@std/assert";
import { KitLoader, KitLoadError } from "./loader.ts";

const fixtureKitDir = fromFileUrl(
  new URL("./testdata/fixture-kit", import.meta.url),
);
const noKitDir = fromFileUrl(
  new URL("./testdata/no-kit-here", import.meta.url),
);
const baseConfig = fromFileUrl(
  new URL("./testdata/base.config.yml", import.meta.url),
);
const localConfig = fromFileUrl(
  new URL("./testdata/local.config.yml", import.meta.url),
);
const missingConfig = fromFileUrl(
  new URL("./testdata/does-not-exist.config.yml", import.meta.url),
);

const loader = new KitLoader();

Deno.test("KitLoader.load: loads a vendored kit with no sidecar config", async () => {
  const kit = await loader.load(fixtureKitDir);
  assertEquals(kit.provisioners().length, 1);
  assertEquals(
    kit.realization().knowabilityOf("databases", "relational", "host"),
    "static",
  );
});

Deno.test("KitLoader.load: throws KitLoadError when the vendored dir has no main.ts", async () => {
  await assertRejects(() => loader.load(noKitDir), KitLoadError);
});

Deno.test("KitLoader.load: silently skips a sidecar path that doesn't exist", async () => {
  const kit = await loader.load(fixtureKitDir, [missingConfig]);
  assertEquals(kit.provisioners().length, 1);
});

Deno.test("KitLoader.load: layers sidecar config over the kit's own defaults, later path wins a conflict", async () => {
  const kit = await loader.load(fixtureKitDir, [baseConfig, localConfig]);

  assertEquals(
    kit.realization().boundFor("databases", "relational", "read-replicas"),
    { max: 2 },
  );
});

Deno.test("KitLoader.load: project-declared provisioners come before the kit's own, in declaration order", async () => {
  const kit = await loader.load(fixtureKitDir, [baseConfig, localConfig]);

  assertEquals(kit.provisioners().length, 2);
});
