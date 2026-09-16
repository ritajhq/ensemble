import { join } from "@std/path";
import { ensureDir, exists, move } from "@std/fs";
import * as KitManifest from "./kit-manifest.ts";
import * as SemVer from "./semver.ts";
import { resolveProjectKitSdkVersion } from "./project-kit-sdk.ts";
import { nameFromUrl, parseUrl } from "./git-url.ts";
import type { PackageSource } from "./package-source.ts";
import type { Registry } from "./registry.ts";
import type { Entry } from "./entry.ts";

/**
 * Installs a kit from an external git repository — the kit-specific front
 * door onto the vendoring primitive (`ens kit install <url>`), kept as its
 * own class rather than a generic "vendor add" so its clone/validate/route
 * steps stay specific to what a kit needs (role routing, entrypoint
 * presence, kitSdk compatibility) instead of a one-size-fits-all contract.
 */
export class KitInstaller {
  constructor(
    private readonly repoRoot: string,
    private readonly registry: Registry,
    private readonly source: PackageSource,
  ) {}

  async install(urlWithOptionalRef: string): Promise<Entry> {
    const { url, ref } = parseUrl(urlWithOptionalRef);
    const scratchDir = await Deno.makeTempDir({
      prefix: "ensemble-kit-install-",
    });

    try {
      await this.source.fetch(url, ref, scratchDir);
      const resolvedRef = await this.source.currentRef(scratchDir);

      const manifest = await KitManifest.read(scratchDir);

      for (const entrypoint of KitManifest.requiredEntrypoints(manifest.role)) {
        if (!await exists(join(scratchDir, entrypoint), { isFile: true })) {
          throw new Error(
            `Kit at ${url} declares role "${manifest.role}" but is missing its required "${entrypoint}" entrypoint.`,
          );
        }
      }

      const projectKitSdkVersion = await resolveProjectKitSdkVersion(
        this.repoRoot,
      );
      if (!SemVer.satisfies(projectKitSdkVersion, manifest.kitSdk)) {
        throw new Error(
          `Kit at ${url} requires kit-sdk "${manifest.kitSdk}", but this project resolves kit-sdk ` +
            `${projectKitSdkVersion}. Pin the kit to a compatible ref, or update this project's kit-sdk version.`,
        );
      }

      const name = nameFromUrl(url);
      const relativePath = join(".ensemble", "kits", manifest.role, name);
      const destination = join(this.repoRoot, relativePath);
      if (await exists(destination)) {
        throw new Error(`A kit is already installed at ${relativePath}.`);
      }

      await ensureDir(join(this.repoRoot, ".ensemble", "kits", manifest.role));
      await move(scratchDir, destination);

      const entry: Entry = { repo: url, ref: resolvedRef, path: relativePath };
      await this.registry.register(entry);
      return entry;
    } finally {
      if (await exists(scratchDir)) {
        await Deno.remove(scratchDir, { recursive: true });
      }
    }
  }
}
