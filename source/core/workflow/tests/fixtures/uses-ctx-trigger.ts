import type { StepContext } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  return { sha: String(ctx.trigger?.sha) };
}
