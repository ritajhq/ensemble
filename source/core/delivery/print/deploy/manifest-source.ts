import { join } from "@std/path";
import { Deploy, type RepoLocator } from "@ensemble/core";

/** Thrown when a delivery name has no manifest under `ci/`. */
export class ManifestNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestNotFoundError";
  }
}

/**
 * Reads `ci/<name>/delivery.yml` as it is written: no deploy kit, no env
 * files, no secrets — showing a manifest needs none of what deploying it
 * does.
 */
export class ManifestSource {
  constructor(
    private readonly repo: RepoLocator,
    private readonly locator: Deploy.Manifest.Locator = new Deploy.Manifest
      .Locator(),
    private readonly loader: Deploy.Manifest.Loader = new Deploy.Manifest
      .Loader(new Deploy.Manifest.Parser()),
  ) {}

  async read(name: string): Promise<Deploy.Workload> {
    const directory = join(await this.repo.findRepoRoot(), "ci", name);
    const path = await this.locator.find(directory);
    if (!path) {
      throw new ManifestNotFoundError(
        `Delivery manifest not found in ${directory} (expected ${
          Deploy.Manifest.Locator.FILE_NAMES.join(" or ")
        })`,
      );
    }
    return await this.loader.loadFile(path);
  }
}
