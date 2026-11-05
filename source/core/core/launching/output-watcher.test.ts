import { assertEquals } from "@std/assert";
import { OutputWatcher } from "./output-watcher.ts";

Deno.test("a burst of writes is one change", async () => {
  const dir = await Deno.makeTempDir();
  let changes = 0;
  const watcher = new OutputWatcher(dir, () => changes++, 100);
  await new Promise((r) => setTimeout(r, 100));
  for (let i = 0; i < 5; i++) await Deno.writeTextFile(`${dir}/f${i}`, "x");
  await new Promise((r) => setTimeout(r, 500));
  watcher.close();
  assertEquals(changes, 1);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("a file replaced by a rename keeps being watched", async () => {
  const dir = await Deno.makeTempDir();
  const file = `${dir}/app`;
  await Deno.writeTextFile(file, "v0");
  let changes = 0;
  const watcher = new OutputWatcher(file, () => changes++, 100);
  await new Promise((r) => setTimeout(r, 100));
  for (const version of ["v1", "v2", "v3"]) {
    await Deno.writeTextFile(`${file}.new`, version);
    await Deno.rename(`${file}.new`, file);
    await new Promise((r) => setTimeout(r, 400));
  }
  watcher.close();
  assertEquals(changes, 3);
  await Deno.remove(dir, { recursive: true });
});

Deno.test("a file's neighbours are not its changes", async () => {
  const dir = await Deno.makeTempDir();
  const file = `${dir}/app`;
  await Deno.writeTextFile(file, "v0");
  let changes = 0;
  const watcher = new OutputWatcher(file, () => changes++, 100);
  await new Promise((r) => setTimeout(r, 100));
  await Deno.writeTextFile(`${dir}/other`, "x");
  await new Promise((r) => setTimeout(r, 400));
  watcher.close();
  assertEquals(changes, 0);
  await Deno.remove(dir, { recursive: true });
});
