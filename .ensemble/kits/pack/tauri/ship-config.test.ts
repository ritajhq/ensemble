import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { ShipConfig } from "./ship-config.ts";
import { Shell } from "./shell.ts";

async function ship(yaml: string): Promise<string> {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(join(dir, "tauri.yml"), yaml);
  return dir;
}

Deno.test("reads the shell, frontend and bundles", async () => {
  const config = await ShipConfig.read(await ship("shell: desktop\nfrontend: web\nbundles: [deb]\n"));
  assertEquals([config.shell, config.frontend, config.bundles], ["desktop", "web", ["deb"]]);
});

Deno.test("the frontend and bundles are optional, the shell is not", async () => {
  const config = await ShipConfig.read(await ship("shell: desktop\n"));
  assertEquals([config.frontend, config.bundles], [undefined, []]);
  await assertRejects(async () => ShipConfig.read(await ship("bundles: [deb]\n")), Error, `"shell" is required`);
});

Deno.test("an unknown key is named", async () => {
  await assertRejects(async () => ShipConfig.read(await ship("shell: a\nneeds: []\n")), Error, "unknown key needs");
});

Deno.test("publishing a build that changed nothing leaves the output alone", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.writeTextFile(join(dir, "built"), "binary");
  const shell = new Shell(dir, dir, undefined, undefined);
  assertEquals(await shell.publish(join(dir, "built"), join(dir, "out", "app")), true);
  assertEquals(await shell.publish(join(dir, "built"), join(dir, "out", "app")), false);
  await Deno.writeTextFile(join(dir, "built"), "binary 2");
  assertEquals(await shell.publish(join(dir, "built"), join(dir, "out", "app")), true);
  assertEquals(await Deno.readTextFile(join(dir, "out", "app")), "binary 2");
});
