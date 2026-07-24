import type { StepContext } from "../../context.ts";

export async function run(ctx: StepContext): Promise<void> {
  const index = String(ctx.matrix?.index);
  if (index === "0") {
    // Fails almost immediately, well before the long-running siblings finish.
    throw new Error("instance 0 failed");
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
