import { createHandleDebugInfo } from "./handler.ts";
import { route, type Feature } from "../features.ts";

export { type InfoResponse } from "./handler.ts";

/**
 * `mountedFeatures` should be every other feature's `name` (i.e. what
 * `createAllFeatures` would return before this one is appended) — the
 * caller passes it in rather than this feature discovering it, since
 * `createAllFeatures` doesn't know its own output until it's built it.
 */
export function createDebugFeature(mountedFeatures: string[], basePath = "/v1/debug"): Feature {
  return route("debug", "GET", basePath, createHandleDebugInfo(mountedFeatures));
}
