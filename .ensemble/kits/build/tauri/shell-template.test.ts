import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { parse as parseToml } from "@std/toml";
import { ShellTemplate } from "./shell-template.ts";

async function scaffolded(
  name: string,
  remote?: string,
): Promise<string> {
  const dest = join(await Deno.makeTempDir(), "app");
  await new ShellTemplate(dest, name, remote, "my_project").write();
  return dest;
}

Deno.test("write: lays out what the kit and Tauri read", async () => {
  const dest = await scaffolded("x");
  for (
    const file of [
      "Cargo.toml",
      "tauri.conf.json",
      "build.rs",
      "src/main.rs",
      "public/index.html",
      "icons/icon.png",
      "capabilities/default.json",
      ".gitignore",
    ]
  ) {
    assertEquals((await Deno.stat(join(dest, file))).isFile, true, file);
  }
});

Deno.test("write: a nested app's crate is named for its last segment", async () => {
  const dest = await scaffolded(
    "desktop/my.shell_2",
    "git@github.com:ritajhq/harness.git",
  );
  const manifest = parseToml(
    await Deno.readTextFile(join(dest, "Cargo.toml")),
  ) as { package: { name: string } };
  assertEquals(manifest.package.name, "my-shell_2");
  const conf = JSON.parse(
    await Deno.readTextFile(join(dest, "tauri.conf.json")),
  );
  assertEquals(conf.productName, "my.shell_2");
  assertEquals(conf.identifier, "com.github.ritajhq.my-shell-2");
});

Deno.test("write: with no remote, the identifier comes from the project's name", async () => {
  const dest = await scaffolded("desktop/shell");
  const conf = JSON.parse(
    await Deno.readTextFile(join(dest, "tauri.conf.json")),
  );
  assertEquals(conf.identifier, "local.my-project.shell");
});

Deno.test("write: the shell's frontend is its own public folder", async () => {
  const dest = await scaffolded("x");
  const conf = JSON.parse(
    await Deno.readTextFile(join(dest, "tauri.conf.json")),
  );
  assertEquals(conf.build.frontendDist, "public");
  assertEquals(
    (await Deno.stat(join(dest, "public", "index.html"))).isFile,
    true,
  );
});

Deno.test("write: the icon is an 8-bit RGBA PNG, the only kind Tauri accepts", async () => {
  const dest = await scaffolded("x");
  const png = await Deno.readFile(join(dest, "icons", "icon.png"));
  assertEquals([...png.slice(1, 4)], [0x50, 0x4e, 0x47]);
  assertEquals(png[24], 8);
  assertEquals(png[25], 6);
});
