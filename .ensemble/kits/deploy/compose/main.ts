import { dirname } from "@std/path";
import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { composeRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { assembleComposeDocument } from "./compose-document.ts";

/**
 * `develop.watch.path` entries are ens app identifiers (e.g. "website/server"),
 * meant to resolve against the workspace's `source/` directory — but compose
 * resolves relative `develop.watch` paths against the compose file's own
 * directory, not an app root. `--project-directory` overrides that base.
 * Deriving it from `artifactPath` (always `<repoRoot>/source/artifacts/
 * deploy/<name>/compose.yaml`, per `@ensemble/core`'s `runDeploy`) is the
 * only source of that path this pure function ever receives — a real, if
 * narrow, coupling to that convention that only `watchCommand` needs.
 */
function sourceDirFor(artifactPath: string): string {
  return dirname(dirname(dirname(dirname(artifactPath))));
}

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
  watchCommand: (artifactPath, name) => [
    "docker",
    "compose",
    "-f",
    artifactPath,
    "-p",
    name,
    "--project-directory",
    sourceDirFor(artifactPath),
    "watch",
  ],
};

export default kit;
