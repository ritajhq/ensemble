import { basename, join } from "@std/path";
import { exists } from "@std/fs";
import type { Registry } from "./registry.ts";
import * as KitManifest from "./kit-manifest.ts";

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

/** Resolves a bare kit name to its role/path by scanning `.ensemble/kits/<role>/<name>` on disk — for a kit that's never been vendored yet (freshly `ens kit new`'d, not yet registered), unlike `resolveInstalledKitPath`'s lockfile-based lookup. Used by `ens kit eject`. */
export async function resolveLocalKitPath(
  repoRoot: string,
  name: string,
): Promise<{ role: KitManifest.Role; path: string }> {
  const matches: { role: KitManifest.Role; path: string }[] = [];
  for (const role of KitManifest.ROLES) {
    const relativePath = join(".ensemble", "kits", role, name);
    if (await exists(join(repoRoot, relativePath), { isDirectory: true })) {
      matches.push({ role, path: relativePath });
    }
  }

  if (matches.length === 0) {
    throw new Error(`No kit named "${name}" found under .ensemble/kits/.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple kits named "${name}" found (${
        matches.map((m) => m.path).join(", ")
      }) — ambiguous.`,
    );
  }
  return matches[0];
}
