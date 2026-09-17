/**
 * Where and under what name a released ship is published. `target` and `name`
 * are the only reserved keys; every other property in the `publish:` block is
 * a publish option collected into `options` and handed to the pack kit's
 * `publish.ts`.
 */
export interface PublishSpec {
  readonly target: string;
  readonly name?: string;
  readonly options: Readonly<Record<string, string>>;
}

/**
 * How to pack a ship this workload's compute entries reference via
 * `${release.<name>.image}`. A sibling of `deploy`, built by pack kits — out
 * of scope for this rearchitecture (see Section 12) beyond staying parseable
 * as part of the envelope.
 */
export interface Release {
  readonly kit: string;
  readonly mode?: string;
  readonly outputName?: string;
  readonly publish?: PublishSpec;
}
