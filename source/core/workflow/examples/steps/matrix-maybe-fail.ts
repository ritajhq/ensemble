import type { StepContext } from "../../context.ts";

export function run(ctx: StepContext): Record<string, string> {
  const component = String(ctx.matrix?.component);
  if (component === "worker") {
    throw new Error("worker build failed");
  }
  return { ok: "true" };
}
