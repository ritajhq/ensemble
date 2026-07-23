export function requireFlag(flags: Record<string, unknown>, key: string): string {
  const value = flags[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required --${key} argument for kit invocation.`);
  }
  return value;
}
