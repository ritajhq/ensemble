import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

/**
 * Requires `Authorization: Bearer <token>` matching
 * ENSEMBLE_WORKFLOW_REGISTRY_TOKEN, compared in constant time. A separate
 * token from the http-trigger feature's — this one grants the ability to
 * deploy/overwrite workflow code, a stronger capability than triggering a
 * run. Fails closed: no token configured means every request is rejected.
 */
export function isAuthorized(request: Request): boolean {
  const token = Deno.env.get("ENSEMBLE_WORKFLOW_REGISTRY_TOKEN");
  if (!token) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);

  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
