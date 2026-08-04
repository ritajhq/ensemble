import type { StepContext } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  return { name: String(ctx.context?.name), path: String(ctx.context?.path) };
}
