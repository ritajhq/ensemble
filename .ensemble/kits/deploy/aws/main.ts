import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { awsRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { assembleCloudFormationDocument } from "./cloudformation-document.ts";

const kit: KitSdk.Deploy.Kit = {
  // deno-lint-ignore require-await
  provisioners: async () => [
    containerOrchestratedProvisioner(),
    relationalProvisioner(),
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
