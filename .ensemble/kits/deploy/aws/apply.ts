import { Stack } from "./stack.ts";

// The aws kit's apply (see main.ts's `applyCommand`): one CloudFormation
// deploy of the rendered template, the same in every environment — which
// AWS account (or local stand-in, like MiniStack) it lands in is whatever
// the environment points the `aws` CLI at, never this kit's choice.
//
// Usage: apply.ts <template path> <stack name>

const [templatePath, stackName] = Deno.args;
if (!templatePath || !stackName) {
  throw new Error("usage: apply.ts <template path> <stack name>");
}

Deno.exit(await new Stack(stackName).deploy(templatePath));
