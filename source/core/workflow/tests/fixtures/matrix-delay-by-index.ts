import type { StepContext } from "../../context.ts";

const delayMsByIndex: Record<string, number> = { "0": 50, "1": 20, "2": 0 };

export async function run(ctx: StepContext): Promise<Record<string, string>> {
  const index = String(ctx.matrix?.index);
  await new Promise((resolve) => setTimeout(resolve, delayMsByIndex[index] ?? 0));
  return { seen: index };
}
