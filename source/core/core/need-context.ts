/** Something a kit's step declared under `needs:`, finished before the kit runs. */
export interface Need {
  readonly kind: "build" | "pack";
  /** The app or ship, as `.ensemble/config.yaml` names it. */
  readonly name: string;
  /**
   * Where its output is. For a build, its folder under `artifacts/`. For a pack,
   * what the pack kit's `describe.ts` reports, which needn't be a path (a Docker
   * image's reference, say), or the `artifacts/packages` folder without one.
   */
  readonly output: string;
}

/** Parses a kit's `--needs` flag. An `ens` passes it only when there are some. */
export function parseNeeds(raw: string | undefined): Need[] {
  if (raw === undefined) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Invalid --needs JSON payload: expected an array, got ${raw}`,
    );
  }
  return parsed as Need[];
}
