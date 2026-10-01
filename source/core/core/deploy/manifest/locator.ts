import { join } from "@std/path";
import { exists } from "@std/fs";

/**
 * Finds a workload's delivery manifest in its `ci/<name>/` directory — the
 * one place the accepted file names live, so `ens deploy`, `ens status` and
 * `ens release` can't drift on which files count as a manifest. Candidates
 * are tried in order: `delivery.yml` wins over an extensionless `delivery`.
 */
export class Locator {
  static readonly FILE_NAMES = ["delivery.yml", "delivery"] as const;

  /** The manifest path in `workloadDir`, or `undefined` when there is none. */
  async find(workloadDir: string): Promise<string | undefined> {
    for (const fileName of Locator.FILE_NAMES) {
      const path = join(workloadDir, fileName);
      if (await exists(path, { isFile: true })) return path;
    }
    return undefined;
  }
}
