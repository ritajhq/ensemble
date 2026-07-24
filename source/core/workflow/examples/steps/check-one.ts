import type { MatrixNeedsResult, StepContext } from "../../context.ts";

export function run(ctx: StepContext): void {
  const build = ctx.needs.build as MatrixNeedsResult;
  console.log(`web image is ${build.outputs.image[1]}`);
}
