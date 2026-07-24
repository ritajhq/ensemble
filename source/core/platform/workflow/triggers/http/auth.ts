import { timingSafeEqual } from "@std/crypto/timing-safe-equal";

/**
 * Requires `Authorization: Bearer <token>` matching ENSEMBLE_HTTP_TRIGGER_TOKEN,
 * compared in constant time. Fails closed: if the env var isn't set, every
 * request is rejected rather than silently allowed through — this endpoint
 * is meant to be reachable from the public internet.
 */
export function isAuthorized(request: Request): boolean {
  const token = Deno.env.get("ENSEMBLE_HTTP_TRIGGER_TOKEN");
  if (!token) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);

  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
