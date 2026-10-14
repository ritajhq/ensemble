import { join } from "@std/path";
import * as Deploy from "@ensemble/core/deploy";
import { Catalog, type Problem } from "./catalog.ts";
import { Manifest } from "./manifest.ts";

/**
 * Reads what a checked-out commit offers, by the same rules `ens` itself
 * applies: a manifest is whatever `ci/<name>/` holds under one of the
 * accepted file names, parsed by `ens`'s own parser; a deploy kit is
 * whatever `.ensemble/kits/deploy/` holds.
 */
export class Discovery {
  constructor(
    private readonly locator = new Deploy.Manifest.Locator(),
    private readonly loader = new Deploy.Manifest.Loader(
      new Deploy.Manifest.Parser(),
    ),
  ) {}

  async discover(checkout: string, commit: string): Promise<Catalog> {
    const manifests: Manifest[] = [];
    const problems: Problem[] = [];

    for (const name of await this.directories(join(checkout, "ci"))) {
      const path = await this.locator.find(join(checkout, "ci", name));
      if (!path) continue;
      try {
        manifests.push(Manifest.of(name, await this.loader.loadFile(path)));
      } catch (error) {
        problems.push({
          manifest: name,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return new Catalog(
      commit,
      manifests,
      problems,
      await this.directories(join(checkout, ".ensemble", "kits", "deploy")),
    );
  }

  /** The directories directly under `path`, by name; none when it's missing. */
  private async directories(path: string): Promise<string[]> {
    const names: string[] = [];
    try {
      for await (const entry of Deno.readDir(path)) {
        if (entry.isDirectory) names.push(entry.name);
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    return names.sort();
  }
}
