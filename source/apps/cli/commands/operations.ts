import { Command, EnumType } from "@cliffy/command";
import {
  DeploymentEnvironment,
  Instance,
  listDeliveryOperations,
  runDeliveryOperation,
} from "@ensemble/core";
import * as Host from "@ensemble/host";

const KIT_OPTION = [
  "-k, --kit <kit:string>",
  "Deploy kit to use (default: the one `deploy.<name>.kit` in .ensemble/config.yaml names). Its folder, ci/<name>/<kit>/operations/, holds the operation's scripts.",
] as const;

const ENV_FILE_OPTION = [
  "--env-file <path:string>",
  "Load an env file (repo-root relative or absolute, repeatable) instead of the default ci/<name>/dev.env, ci/<name>/<kit>.env and .ensemble/deploy/<name>/secrets.env.",
  { collect: true },
] as const;

/**
 * Without `--env-file`, an operation loads the same files `ens develop` does,
 * since it acts on a deployment you brought up locally.
 */
function envFilesFor(name: string, envFile: string[] | undefined) {
  return envFile
    ? DeploymentEnvironment.required(envFile)
    : (kit: string) => DeploymentEnvironment.developConvention(name, kit);
}

/**
 * `ens operations <name>` — lists the operations a workload declares, one per
 * line: name, a tab, description. Only the manifest is read, so no deploy kit
 * is loaded.
 */
export const operationsCommand = new Command()
  .name("operations")
  .alias("ops")
  .description(
    "List the operations a workload declares in ci/<name>/delivery.yml: name, a tab, description.",
  )
  .arguments("<name:string>")
  .option(...KIT_OPTION)
  .option(...ENV_FILE_OPTION)
  .action(async ({ kit, envFile }, name: string) => {
    await listDeliveryOperations(
      name,
      kit,
      { envFiles: envFilesFor(name, envFile) },
      Host.createPorts().repo,
    );
  });

/**
 * `ens operation <name> <operation> [args...]` — runs one of a workload's
 * declared operations (see `@ensemble/core`'s `deploy/operation.ts` for what an
 * operation is and why it's invoked rather than fired by a deploy). The kit
 * matters twice: the operation's script lives in the kit's own folder, so the
 * same operation can do its step differently on each platform, and resolving
 * its arguments means rendering the workload, which only that kit can do.
 */
export const operationCommand = new Command()
  .name("operation")
  .alias("op")
  .description(
    "Run one of a workload's operations declared in ci/<name>/delivery.yml.",
  )
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments("<name:string> <operation:string> [args...:string]")
  .option(...KIT_OPTION)
  .option(
    "--artifacts <artifacts:artifacts>",
    "Which release locator to resolve.",
    { default: "published" as const },
  )
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>} references to for published artifacts.",
    { default: "latest" },
  )
  .option(
    "--instance <slug:string>",
    "Act on this named instance of the workload (see `ens deploy --instance`) rather than its plain deployment.",
  )
  .option(...ENV_FILE_OPTION)
  .action(
    async (
      { kit, artifacts, version, instance, envFile },
      name: string,
      operation: string,
      ...args: string[]
    ) => {
      await runDeliveryOperation(
        name,
        kit,
        operation,
        args,
        {
          artifacts,
          version,
          envFiles: envFilesFor(name, envFile),
          instance: instance ? Instance.parse(instance) : undefined,
        },
        Host.createPorts().repo,
        new Host.SubprocessPackKitGateway(),
        new Host.SubprocessKitLoader(),
      );
    },
  );
