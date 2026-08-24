import { isAuthorizedFor, type TokenPermissions } from "./auth/tokens.ts";

/** A route a platform feature contributes to the shared server. */
export interface Feature {
  /** Used both for logging and to derive this feature's gating env var. */
  name: string;
  method: string;
  pattern: URLPattern;
  handle: (request: Request, params: Record<string, string | undefined>) => Response | Promise<Response>;
}

/** Builds a Feature from a plain pathname, wrapping it in a URLPattern. */
export function route(
  name: string,
  method: string,
  pathname: string,
  handle: Feature["handle"],
): Feature {
  return { name, method, pattern: new URLPattern({ pathname }), handle };
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

/** Responds 401 if `request` isn't authorized for `scope`, otherwise undefined. */
export async function requireAuth(
  request: Request,
  scope: keyof TokenPermissions,
): Promise<Response | undefined> {
  if (await isAuthorizedFor(request, scope)) return undefined;
  return Response.json({ error: "Missing or invalid bearer token." }, {
    status: 401,
  });
}

/** Parses `request`'s body as JSON, or an error Response if it isn't valid JSON. */
export async function parseJsonBody(
  request: Request,
): Promise<{ body: unknown } | { errorResponse: Response }> {
  const text = await request.text();
  try {
    return { body: JSON.parse(text) };
  } catch {
    return {
      errorResponse: Response.json({
        error: "Request body must be valid JSON.",
      }, { status: 400 }),
    };
  }
}
