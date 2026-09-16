import { $ } from "@david/dax";
import { EnsembleConfigStore, type HookConfig } from "./config.ts";

/**
 * Runs the shell commands configured under the top-level `hooks:` key in
 * `.ensemble/config.yaml` at defined points in `ens`'s lifecycle. Constructed
 * once with `repoRoot`; each command runs at the repo root through `sh -c`.
 */
export class Hooks {
  constructor(private readonly repoRoot: string) {}

  /** The configured `hooks.release.after` hooks, in the order they should run. */
  async releaseAfter(): Promise<HookConfig[]> {
    const config = await new EnsembleConfigStore(this.repoRoot).load();
    return config.hooks?.release?.after ?? [];
  }

  /**
   * Runs a release hook at the repo root, exposing the released tag as
   * `$ENSEMBLE_RELEASE_TAG`. Throws on a non-zero exit — the release itself is
   * already done by the time a hook runs, so a hook failure is surfaced rather
   * than silently swallowed.
   */
  async run(hook: HookConfig, tag: string): Promise<void> {
    const result = await $`sh -c ${hook.run}`
      .cwd(this.repoRoot)
      .env({ ENSEMBLE_RELEASE_TAG: tag })
      .noThrow();
    if (result.code !== 0) {
      throw new Error(`"${hook.name}" hook failed (exit ${result.code}): ${hook.run}`);
    }
  }
}
