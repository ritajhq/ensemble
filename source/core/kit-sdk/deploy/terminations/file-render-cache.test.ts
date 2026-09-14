import { join } from "@std/path";
import { assertEquals } from "@std/assert";
import { FileRenderCache } from "./file-render-cache.ts";

Deno.test("FileRenderCache.readLast: returns undefined when nothing has been cached yet", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const cache = new FileRenderCache(join(dir, "last-rendered.txt"));
    assertEquals(await cache.readLast(), undefined);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FileRenderCache: writeLast then readLast round-trips the content, creating parent dirs as needed", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const cache = new FileRenderCache(join(dir, "nested", "last-rendered.txt"));
    await cache.writeLast("services: {}\n");
    assertEquals(await cache.readLast(), "services: {}\n");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("FileRenderCache.writeLast: a later write replaces the previous content", async () => {
  const dir = await Deno.makeTempDir();
  try {
    const cache = new FileRenderCache(join(dir, "last-rendered.txt"));
    await cache.writeLast("first");
    await cache.writeLast("second");
    assertEquals(await cache.readLast(), "second");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
