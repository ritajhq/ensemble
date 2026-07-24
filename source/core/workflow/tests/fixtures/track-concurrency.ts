import type { StepContext } from "../../context.ts";

/**
 * Each instance is its own subprocess, so an in-memory counter can't be
 * shared across them — instead, each instance writes its own start/end
 * marker file into markerDir; the test reads the whole directory afterward
 * and computes the true peak concurrent overlap from the timestamps.
 */
export async function run(ctx: StepContext): Promise<void> {
  const markerDir = ctx.variables.MARKER_DIR;
  const index = String(ctx.matrix?.index);
  await Deno.writeTextFile(`${markerDir}/${index}.start`, String(Date.now()));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await Deno.writeTextFile(`${markerDir}/${index}.end`, String(Date.now()));
}
