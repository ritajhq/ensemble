export interface DebugInfoResponse {
  imageTag: string;
  mountedFeatures: string[];
}

/**
 * GET /v1/debug — what build is actually running and which routes it has
 * mounted, so "is the fix actually deployed" can be answered by curling the
 * server instead of guessing from release tags. `imageTag` reflects
 * `ENSEMBLE_IMAGE_TAG`, set by workflows/deploy/compose.yaml from the same
 * `IMAGE_TAG` the deploy workflow builds and pushes the image as — "unknown"
 * for a container started outside that deploy path (e.g. local `docker run`).
 */
export function createHandleDebugInfo(mountedFeatures: string[]) {
  return function handleDebugInfo(): Response {
    const body: DebugInfoResponse = {
      imageTag: Deno.env.get("ENSEMBLE_IMAGE_TAG") ?? "unknown",
      mountedFeatures,
    };
    return Response.json(body);
  };
}
