import { dirname, join, normalize } from "@std/path";
import { ensureDir } from "@std/fs";
import { UntarStream } from "@std/tar/untar-stream";

/**
 * Extracts a .tar.gz stream into destDir. The archive's entries are expected
 * to be relative paths rooted at the workflow's own directory (e.g.
 * "workflow.yml", "steps/build.ts") — not wrapped in an extra name/ prefix.
 * Rejects (and stops, without writing the offending entry) any entry whose
 * normalized path would escape destDir, e.g. "../other-workflow/x.ts".
 */
export async function extractTarGz(body: ReadableStream<Uint8Array>, destDir: string): Promise<void> {
  const gunzipped = body.pipeThrough(
    new DecompressionStream("gzip") as ReadableWritablePair<Uint8Array, Uint8Array>,
  );
  const entries = gunzipped.pipeThrough(new UntarStream());

  for await (const entry of entries) {
    const relative = normalize(entry.path);
    if (relative.startsWith("..") || relative.startsWith("/")) {
      await entry.readable?.cancel();
      throw new Error(`Archive entry "${entry.path}" escapes the workflow directory.`);
    }

    const fullPath = join(destDir, relative);
    if (!entry.readable) {
      await ensureDir(fullPath);
      continue;
    }

    await ensureDir(dirname(fullPath));
    const file = await Deno.open(fullPath, { create: true, write: true, truncate: true });
    await entry.readable.pipeTo(file.writable);
  }
}
