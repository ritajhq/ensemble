import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { composeRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { assembleComposeDocument } from "./compose-document.ts";

const kit: KitSdk.Deploy.Kit = {
  provisioners:
    () => [containerOrchestratedProvisioner(), relationalProvisioner()],
  realization: composeRealization,
  present: (artifacts, graph) => ({
    filename: "compose.yaml",
    content: stringifyYaml(assembleComposeDocument(artifacts, graph)),
  }),
  applyCommand: (
    artifactPath,
    name,
  ) => ["docker", "compose", "-f", artifactPath, "-p", name, "up", "-d"],
};

export default kit;
