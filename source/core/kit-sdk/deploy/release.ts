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
export interface Release {
  kit: string;
  mode?: string;
  outputName?: string;
  /** Which of the pack kit's declared publish targets (its `kit.yml` `publish:` map) `ens release` should push this ship through. Omitted means this ship is packed as part of a release but never published anywhere. */
  publish?: string;
}
