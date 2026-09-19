import { dirname } from "@std/path";
import { stringify as stringifyYaml } from "@std/yaml";
import * as KitSdk from "@ensemble/kit-sdk";
import { composeRealization } from "./realization.ts";
import { containerOrchestratedProvisioner } from "./provisioners/container-orchestrated.ts";
import { relationalProvisioner } from "./provisioners/relational.ts";
import { storageVolumeProvisioner } from "./provisioners/storage-volume.ts";
import { assembleComposeDocument } from "./compose-document.ts";
import { externalNetworkEmulations } from "./external-networks.ts";

/**
 * `develop.watch.path` entries are ens app identifiers (e.g. "website/server")
 * — and what a container actually runs is that app's *build output*
 * (`source/artifacts/<app>`, what the Dockerfile's `COPY --from=<app>` and
 * the docker pack kit's own `--build-context <app>=<artifacts>/<app>` both
 * resolve to), not its raw TypeScript source under `source/apps/<app>`. So
 * `--project-directory` needs to point at `source/artifacts/`, not `source/`
 * itself — compose resolves relative `develop.watch` paths against whichever
 * directory this names. Deriving it from `artifactPath` (always `<repoRoot>/
 * source/artifacts/deploy/<name>/compose.yaml`, per `@ensemble/core`'s
 * `runDeploy`) is the only source of that path this pure function ever
 * receives — a real, if narrow, coupling to that convention that only
 * `watchCommand` needs.
 */
function artifactsDirFor(artifactPath: string): string {
  return dirname(dirname(dirname(artifactPath)));
}

const kit: KitSdk.Deploy.Kit = {
  // deno-lint-ignore require-await
  provisioners: async () => [
    containerOrchestratedProvisioner(),
    relationalProvisioner(),
    storageVolumeProvisioner(),
  ],
  realization: composeRealization,
  // deno-lint-ignore require-await
  present: async (artifacts, graph) => ({
    filename: "compose.yaml",
    content: stringifyYaml(assembleComposeDocument(artifacts, graph)),
  }),
  // deno-lint-ignore require-await
  applyCommand: async (
    artifactPath,
    name,
  ) => ["docker", "compose", "-f", artifactPath, "-p", name, "up", "-d"],
  // deno-lint-ignore require-await
  watchCommand: async (artifactPath, name) => [
    "docker",
    "compose",
    "-f",
    artifactPath,
    "-p",
    name,
    "--project-directory",
    artifactsDirFor(artifactPath),
    "watch",
  ],
  emulateExternals: externalNetworkEmulations,
};

export default kit;
