function getByDotPath(payload: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, payload);
}

/** Builds trigger.* from a workflow's `on: - http: payload:` mapping (trigger key -> dot-path into `payload`). */
export function extractTriggerPayload(payload: unknown, mapping: Record<string, string>): Record<string, unknown> {
  const trigger: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(mapping)) {
    trigger[key] = getByDotPath(payload, path);
  }
  return trigger;
}
