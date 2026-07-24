import type { StepContext } from "../../context.ts";

/**
 * Writes `<markerDir>/<index>.started` immediately, then fails if index is
 * "0". Combined with `max-parallel: 1` (strict sequential dispatch), the
 * absence of a `.started` marker for a later index proves fail-fast
 * skipped it before it ever started — not a race, since only one instance
 * is ever in flight at a time.
 */
export async function run(ctx: StepContext): Promise<void> {
  const markerDir = ctx.variables.MARKER_DIR;
  const index = String(ctx.matrix?.index);
  await Deno.writeTextFile(`${markerDir}/${index}.started`, "");
  if (index === "0") {
    throw new Error("instance 0 failed");
  }
}
