import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { awsRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { assembleCloudFormationDocument } from "./cloudformation-document.ts";

const kit: KitSdk.Deploy.Kit = {
  provisioners:
    () => [containerOrchestratedProvisioner(), relationalProvisioner()],
  realization: awsRealization,
  present: (artifacts) => ({
    filename: "template.yaml",
    content: stringifyYaml(assembleCloudFormationDocument(artifacts)),
  }),
  applyCommand: (artifactPath, name) => [
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
