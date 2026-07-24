/** A route a platform feature contributes to the shared server. */
export interface Feature {
  /** Used both for logging and to derive this feature's gating env var. */
  name: string;
  method: string;
  path: string;
  handle: (request: Request) => Response | Promise<Response>;
}

/**
 * Every feature is enabled by default (opt-out): set
 * `ENSEMBLE_FEATURE_<NAME>=false` (name upper-cased, "-" -> "_") to disable
 * one without removing it from the feature list.
 */
export function isFeatureEnabled(name: string): boolean {
  const key = `ENSEMBLE_FEATURE_${name.toUpperCase().replaceAll("-", "_")}`;
  return Deno.env.get(key) !== "false";
}
