import { fromFileUrl } from "@std/path";
import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { awsRealization } from "./realization.ts";
import { containerProvisioner } from "./provisioners/container.ts";
import { functionProvisioner } from "./provisioners/function.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { keyValueProvisioner } from "./provisioners/key-value.ts";
import { objectStorageProvisioner } from "./provisioners/object-storage.ts";
import { gatewayProvisioner } from "./provisioners/gateway.ts";
import { assembleCloudFormationDocument } from "./cloudformation-document.ts";

const kit: KitSdk.Deploy.Kit = {
  // deno-lint-ignore require-await
  provisioners: async () => [
    containerProvisioner(),
    functionProvisioner(),
    relationalProvisioner(),
    keyValueProvisioner(),
    objectStorageProvisioner(),
    gatewayProvisioner(),
  ],
  realization: awsRealization,
  // deno-lint-ignore require-await
  present: async (artifacts) => ({
    filename: "template.yaml",
    content: stringifyYaml(assembleCloudFormationDocument(artifacts)),
  }),
  // Through a script of this kit's own (./apply.ts) rather than a bare `aws
  // cloudformation deploy`: a function's locally packed bundle has to be
  // uploaded first. Either way it's the environment's `aws` configuration
  // that decides where the stack goes.
  // deno-lint-ignore require-await
  applyCommand: async (artifactPath, name) =>
    kitScript("./apply.ts", artifactPath, name),
  // The same deploy, then a sync of each function's code from its apps'
  // build output on every change (./watch.ts) — for any function that
  // declares `development.sync`.
  // deno-lint-ignore require-await
  watchCommand: async (artifactPath, name) =>
    kitScript("./watch.ts", artifactPath, name),
};

/**
 * The argv running one of this kit's own scripts with the template path and
 * stack name — under the same `deno` running this kit, which the kit host
 * starts with the real executable, never a `deno compile`d `ens`.
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
