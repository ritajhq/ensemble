export function requireFlag(
  flags: Record<string, unknown>,
  key: string,
): string {
  const value = flags[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required --${key} argument for kit invocation.`);
  }
  return value;
}

/**
 * Runs a kit's publish authorization check and turns its outcome into the
 * exit-code-plus-stderr verdict `ens` reads: exits 0 when `check` resolves,
 * and when it throws, prints only the error's message (no stack — it's shown
 * to the developer as the reason) to stderr and exits 1.
 */
export async function runAuthorization(
  check: () => Promise<void>,
): Promise<never> {
  try {
    await check();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
  Deno.exit(0);
}
