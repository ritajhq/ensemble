import { join, relative } from "@std/path";
import { exists, walk } from "@std/fs";

const MARKER_FILENAME = ".ensemble-build-cache.json";

interface Marker {
  inputHash: string;
}

/** Skips a build kit invocation when its declared inputs haven't changed since the last successful build. */
export class BuildCache {
  /** True if `outDir` already holds output built from the current `sourceDir`/mode/vars. */
  async isUpToDate(
    sourceDir: string,
    outDir: string,
    mode: string,
    vars: Record<string, string>,
  ): Promise<boolean> {
    if (!await hasAnyFile(outDir)) return false;

    const marker = await readMarker(outDir);
    if (!marker) return false;

    const currentHash = await hashInputs(sourceDir, mode, vars);
    return marker.inputHash === currentHash;
  }

  /** Records the current source/mode/vars as the input state behind `outDir`'s freshly built output. */
  async recordBuilt(
    sourceDir: string,
    outDir: string,
    mode: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const inputHash = await hashInputs(sourceDir, mode, vars);
    const marker: Marker = { inputHash };
    await Deno.writeTextFile(join(outDir, MARKER_FILENAME), JSON.stringify(marker));
  }
}

async function hasAnyFile(dir: string): Promise<boolean> {
  for await (const entry of walk(dir, { includeDirs: false, maxDepth: 1 })) {
    if (entry.name !== MARKER_FILENAME) return true;
  }
  return false;
}

async function readMarker(outDir: string): Promise<Marker | null> {
  const path = join(outDir, MARKER_FILENAME);
  if (!await exists(path, { isFile: true })) return null;
  try {
    return JSON.parse(await Deno.readTextFile(path)) as Marker;
  } catch {
    return null;
  }
}

async function hashInputs(
  sourceDir: string,
  mode: string,
  vars: Record<string, string>,
): Promise<string> {
  const entries: string[] = [];
  for await (const entry of walk(sourceDir, { includeDirs: false })) {
    entries.push(relative(sourceDir, entry.path));
  }
  entries.sort();

  const chunks: Uint8Array[] = [];
  for (const relativePath of entries) {
    chunks.push(new TextEncoder().encode(`\0path:${relativePath}\0`));
    chunks.push(await Deno.readFile(join(sourceDir, relativePath)));
  }
  chunks.push(new TextEncoder().encode(`\0mode:${mode}\0vars:${JSON.stringify(sortKeys(vars))}`));

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sortKeys(vars: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(vars).sort()) sorted[key] = vars[key];
  return sorted;
}
