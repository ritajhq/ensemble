import { createHandleDebugInfo } from "./handler.ts";
import type { Feature } from "../features.ts";

export { type DebugInfoResponse } from "./handler.ts";

/**
 * `mountedFeatures` should be every other feature's `name` (i.e. what
 * `createAllFeatures` would return before this one is appended) — the
 * caller passes it in rather than this feature discovering it, since
 * `createAllFeatures` doesn't know its own output until it's built it.
 */
export function createDebugFeature(mountedFeatures: string[]): Feature {
  return {
    name: "debug",
    method: "GET",
    pattern: new URLPattern({ pathname: "/v1/debug" }),
    handle: createHandleDebugInfo(mountedFeatures),
  };
}
