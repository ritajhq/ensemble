import { Deployment } from "./deployment.ts";
import type { Plan } from "./plan.ts";
import { Workspace } from "./workspace.ts";
import { Wrangler } from "./wrangler.ts";
import { WranglerConfigs } from "./wrangler-config.ts";

// The cloudflare kit's apply (see main.ts's `applyCommand`): the plan brought
// about in the account the environment names — what's missing created, every
// Worker deployed from its release. A local target has nothing to apply to:
// its runtime runs only as long as `ens develop` does.
//
// Usage: apply.ts <plan path> <deployment name>

const [planPath, name] = Deno.args;
if (!planPath || !name) {
  throw new Error("usage: apply.ts <plan path> <deployment name>");
}

const plan = JSON.parse(await Deno.readTextFile(planPath)) as Plan;
if (plan.target.kind === "local") {
  console.error(
    "The local Workers runtime runs only while `ens develop` does: run that instead, or deploy to an account.",
  );
  Deno.exit(1);
}

const deployment = new Deployment(
  plan,
  new WranglerConfigs(plan, name),
  new Workspace(planPath),
  new Wrangler(),
);
for (const line of await deployment.apply("releases")) console.error(line);
