import type { StepContext } from "../../context.ts";
import type { MatrixNeedsResult } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  const build = ctx.needs.build as MatrixNeedsResult;
  const lines = build.matrix.map((combo, i) => `${combo.component}=${build.outputs.image[i]}`);
  return { summary: lines.join(", ") };
}
