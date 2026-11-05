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
