import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { awsRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { functionProvisioner } from "./provisioners/function.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { keyValueProvisioner } from "./provisioners/key-value.ts";
import { objectStorageProvisioner } from "./provisioners/object-storage.ts";
import { gatewayProvisioner } from "./provisioners/gateway.ts";
import { assembleCloudFormationDocument } from "./cloudformation-document.ts";

const kit: KitSdk.Deploy.Kit = {
  // deno-lint-ignore require-await
  provisioners: async () => [
    containerOrchestratedProvisioner(),
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
  // deno-lint-ignore require-await
  applyCommand: async (artifactPath, name) => [
    "aws",
    "cloudformation",
    "deploy",
    "--template-file",
    artifactPath,
    "--stack-name",
    name,
    "--capabilities",
    "CAPABILITY_NAMED_IAM",
  ],
};

export default kit;
