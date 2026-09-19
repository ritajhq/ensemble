import * as KitSdk from "@ensemble/kit-sdk";

/**
 * `--emulate-externals` on compose: every `deploy.external` entry is assumed
 * to be a Docker network (the only external type compose gives meaning to —
 * see the `container-orchestrated` provisioner's `networks` param), stood up
 * with `docker network create` when `docker network inspect` says it isn't
 * there yet. An entry declaring any other `type` has no compose emulation to
 * offer, so this throws rather than silently skipping it.
 */
// deno-lint-ignore require-await
export async function externalNetworkEmulations(
  workload: KitSdk.Deploy.Workload,
): Promise<readonly KitSdk.Deploy.ExternalEmulation[]> {
  return Object.entries(workload.external ?? {}).map(([name, declaration]) => {
    if (declaration.type !== "network") {
      throw new Error(
        `The compose kit only knows how to emulate "network"-typed externals ("external.${name}" is "${declaration.type}").`,
      );
    }
    return {
      name,
      check: ["docker", "network", "inspect", declaration.name],
      create: ["docker", "network", "create", declaration.name],
    };
  });
}
