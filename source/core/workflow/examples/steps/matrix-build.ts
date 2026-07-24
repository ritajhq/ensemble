import type { StepContext } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  const component = String(ctx.matrix?.component);
  return { image: `myregistry/${component}:sha` };
}
