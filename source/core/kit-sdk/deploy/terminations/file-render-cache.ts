import { join } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import type { RenderCachePort } from "./render-cache.ts";

/** Stores the last-rendered artifact's content as a single file under one directory — the adapter behind `RenderCachePort`. */
export class FileRenderCache implements RenderCachePort {
  constructor(private readonly path: string) {}

  async readLast(): Promise<string | undefined> {
    if (!await exists(this.path, { isFile: true })) return undefined;
    return await Deno.readTextFile(this.path);
  }

  async writeLast(content: string): Promise<void> {
    await ensureDir(join(this.path, ".."));
    await Deno.writeTextFile(this.path, content);
  }
}
