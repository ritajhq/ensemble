import type { StepContext } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  return { url: ctx.env.API_URL };
}
