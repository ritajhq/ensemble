import { fromFileUrl } from "@std/path";
import * as KitSdk from "@ensemble/kit-sdk";
import { assemblePlan } from "./plan-document.ts";
import { functionProvisioner } from "./provisioners/function.ts";
import { gatewayProvisioner } from "./provisioners/gateway.ts";
import { keyValueProvisioner } from "./provisioners/key-value.ts";
import { objectStorageProvisioner } from "./provisioners/object-storage.ts";
import { cloudflareRealization } from "./realization.ts";
import { targetOf } from "./target.ts";

const kit: KitSdk.Deploy.Kit = {
  // deno-lint-ignore require-await
  provisioners: async () => [
    functionProvisioner(),
    keyValueProvisioner(),
    objectStorageProvisioner(),
    gatewayProvisioner(),
  ],
  realization: cloudflareRealization,
  // deno-lint-ignore require-await
  present: async (artifacts) => ({
    filename: "plan.json",
    content: `${
      JSON.stringify(
        assemblePlan(artifacts, targetOf(Deno.env.toObject())),
        null,
        2,
      )
    }\n`,
  }),
  // Through scripts of this kit's own, with wrangler doing the talking to
  // Cloudflare: there's no template to hand the plan to, so the apply
  // creates what's missing (./apply.ts), and the watch (./watch.ts) either
  // runs it all locally or keeps a deployed one current.
  // deno-lint-ignore require-await
  applyCommand: async (artifactPath, name) =>
    kitScript("./apply.ts", artifactPath, name),
  // deno-lint-ignore require-await
  watchCommand: async (artifactPath, name) =>
    kitScript("./watch.ts", artifactPath, name),
};

/**
 * The argv running one of this kit's own scripts with the plan path and
 * deployment name — under the same `deno` running this kit, which the kit
 * host starts with the real executable, never a `deno compile`d `ens`.
 */
function kitScript(
  script: string,
  artifactPath: string,
  name: string,
): readonly string[] {
  return [
    Deno.execPath(),
    "run",
    "-A",
    "-q",
    "--minimum-dependency-age",
    "0",
    fromFileUrl(new URL(script, import.meta.url)),
    artifactPath,
    name,
  ];
}

export default kit;
