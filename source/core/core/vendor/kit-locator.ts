import { basename, join } from "@std/path";
import type { Registry } from "./registry.ts";

const KITS_PREFIX = join(".ensemble", "kits") + "/";

/** Resolves a bare kit name (e.g. "react") to its full registered path (e.g. ".ensemble/kits/build/react") — so `ens kit pin`/`ens kit update` don't need the caller to know which role a kit was installed under. */
export async function resolveInstalledKitPath(
  registry: Registry,
  name: string,
): Promise<string> {
  const matches = (await registry.all()).filter(
    (entry) =>
      entry.path.startsWith(KITS_PREFIX) && basename(entry.path) === name,
  );

  if (matches.length === 0) {
    throw new Error(`No installed kit named "${name}" found.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple installed kits named "${name}" found (${
        matches.map((m) => m.path).join(", ")
      }) — ambiguous.`,
    );
  }
  return matches[0].path;
}
