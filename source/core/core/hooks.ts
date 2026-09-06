import { $ } from "@david/dax";
import { EnsembleConfigStore } from "./config.ts";

/**
 * Runs the shell commands configured under the top-level `hooks:` key in
 * `.ensemble/config.yaml` at defined points in `ens`'s lifecycle. Constructed
 * once with `repoRoot`; each command runs at the repo root through `sh -c`.
 */
export class Hooks {
  constructor(private readonly repoRoot: string) {}

  /** The configured `hooks.release.after` command, or undefined if none is set. */
  async releaseAfter(): Promise<string | undefined> {
    const config = await new EnsembleConfigStore(this.repoRoot).load();
    return config.hooks?.release?.after;
  }

  /**
   * Runs a release hook command at the repo root, exposing the released tag as
   * `$ENSEMBLE_RELEASE_TAG`. Throws on a non-zero exit — the release itself is
   * already done by the time a hook runs, so a hook failure is surfaced rather
   * than silently swallowed.
   */
  async run(command: string, tag: string): Promise<void> {
    const result = await $`sh -c ${command}`
      .cwd(this.repoRoot)
      .env({ ENSEMBLE_RELEASE_TAG: tag })
      .noThrow();
    if (result.code !== 0) {
      throw new Error(`release.after hook failed (exit ${result.code}): ${command}`);
    }
  }
}
