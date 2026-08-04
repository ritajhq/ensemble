/**
 * Encodes a workflow name into a URL-safe id. Names can contain "/" — e.g.
 * "ensemble/server", as landed by the git integration's nested layout —
 * which a raw URL path segment can't carry, so every route that identifies a
 * workflow works in terms of this id instead of the name directly. Mirrors
 * source/core/core/workflow.ts's encodeWorkflowId/decodeWorkflowId exactly.
 */
export function encodeWorkflowId(name: string): string {
  return btoa(name).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeWorkflowId(id: string): string {
  const padded = id.replaceAll("-", "+").replaceAll("_", "/");
  const withPadding = padded + "=".repeat((4 - padded.length % 4) % 4);
  return atob(withPadding);
}
