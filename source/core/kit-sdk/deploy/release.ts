/**
 * How to pack this ship into a deployable image — the recipe a compute
 * entry's `image: ${release.<name>.image}` resolves through (see
 * reference.ts). Declared per workload rather than once per repo: a
 * workload's own compute entries may need a particular pack `mode`/
 * `outputName` for how they consume the image, so the recipe travels with
 * the workload that needs it rather than being factored out — accepting
 * that the same ship may be declared identically in more than one
 * workload's `release:` section (see `ens release`, which deduplicates
 * across workloads by ship name + options).
 *
 * No discriminant `type` (unlike every other category) because there's
 * exactly one shape today: "pack a ship with a kit." Add one only when a
 * second real shape shows up — see compute.ts's Port lesson on not
 * pre-building for a hypothetical future.
 */
/**
 * Where and under what name a released ship is published. `target` and `name`
 * are the only reserved keys; every other property in the `publish:` block is
 * a publish option collected into `options` and handed to the pack kit's
 * `publish.ts`, which defines what each option means (e.g. the docker kit
 * reads `registry`, the github kit reads `repo`).
 */
export interface PublishSpec {
  /** Which of the pack kit's declared publish targets (its `kit.yml` `publish:` map) to push through, e.g. "github" or "push". */
  target: string;
  /**
   * The name to publish the artifact under — how each kit uses it is
   * kit-owned: the docker kit treats it as the remote image name (appending
   * the release version as a tag), the deno.compile/github kit as the
   * uploaded release asset's filename. Omitted falls back to the ship's
   * `outputName`, then its name.
   */
  name?: string;
  /** Every `publish:` property other than `target`/`name`, passed through to the kit's `publish.ts` (e.g. `registry`, `repo`). */
  options: Record<string, string>;
}

export interface Release {
  kit: string;
  mode?: string;
  outputName?: string;
  /** How to publish this ship during `ens release`. Omitted means it's packed as part of a release but never published anywhere. */
  publish?: PublishSpec;
}
