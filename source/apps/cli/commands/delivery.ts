import { Command, EnumType } from "@cliffy/command";
import { runDeliveryTask } from "@ensemble/core";
import * as Host from "@ensemble/host";

/**
 * `ens delivery task <name> <kit> [task] [args...]` — runs one of a workload's
 * declared tasks (see `@ensemble/core`'s `deploy/task.ts` for what a task is
 * and why it's invoked rather than fired by a deploy); with no task named, it
 * lists what the workload declares. The kit is required because resolving a
 * task's arguments means rendering the workload, and only a kit can render it
 * — the same reason `ens deploy` and `ens deploy explain` take one.
 *
 * Nested under `delivery` rather than a bare `ens task`, because what makes a
 * task meaningful is *which* delivery it belongs to: the manifest declaring
 * it, the workload whose values its arguments resolve against, and the stack
 * that workload's deploy brought up.
 */
const taskCommand = new Command()
  .name("task")
  .description(
    "Run one of a workload's tasks declared in ci/<name>/delivery.yml, or list them when no task is named.",
  )
  .type("artifacts", new EnumType(["local", "published"]))
  .arguments("<name:string> <kit:string> [task:string] [args...:string]")
  .option(
    "--artifacts <artifacts:artifacts>",
    "Which release locator to resolve.",
    {
      default: "published" as const,
    },
  )
  .option(
    "--version <version:string>",
    "Released version to resolve ${release.<name>} references to for published artifacts.",
    { default: "latest" },
  )
  .action(
    async (
      { artifacts, version },
      name: string,
      kit: string,
      task: string | undefined,
      ...args: string[]
    ) => {
      await runDeliveryTask(
        name,
        kit,
        task,
        args,
        { artifacts, version },
        Host.createPorts().repo,
        new Host.SubprocessPackKitGateway(),
        new Host.SubprocessKitLoader(),
      );
    },
  );

export const deliveryCommand = new Command()
  .name("delivery")
  .description(
    "Workload delivery: the non-provisioning operator steps a manifest declares.",
  )
  .command("task", taskCommand);
