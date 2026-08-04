import { Command } from "@cliffy/command";
import { findRepoRoot, setAppBuildKit, setLocalVar } from "@ensemble/core";
import * as CliUtil from "./util.ts";

export const configCommand = new Command()
  .name("config")
  .description("Manage .ensemble/config.yaml.")
  .command(
    "set-build-kit",
    new Command()
      .description("Associate an app with a build kit.")
      .arguments("<app:string> <kit:string>")
      .action(async (_options, app, kit) => {
        const repoRoot = await findRepoRoot();
        await setAppBuildKit(repoRoot, app, kit);
        console.log(`Set build.${app}.kit = ${kit}`);
      }),
  )
  .command(
    "set-build-var",
    new Command()
      .description(
        "Set a personal default build var (KEY=VALUE) for an app, stored in the gitignored .ensemble/config.local.yaml.",
      )
      .arguments("<app:string> <pair:string>")
      .action(async (_options, app, pair) => {
        const repoRoot = await findRepoRoot();
        const [key, value] = CliUtil.splitPair(pair);
        await setLocalVar(repoRoot, "build", app, key, value);
        console.log(`Set local default build var ${key}=${value} for "${app}".`);
      }),
  )
  .command(
    "set-pack-var",
    new Command()
      .description(
        "Set a personal default pack var (KEY=VALUE) for a ship, stored in the gitignored .ensemble/config.local.yaml.",
      )
      .arguments("<ship:string> <pair:string>")
      .action(async (_options, ship, pair) => {
        const repoRoot = await findRepoRoot();
        const [key, value] = CliUtil.splitPair(pair);
        await setLocalVar(repoRoot, "pack", ship, key, value);
        console.log(`Set local default pack var ${key}=${value} for "${ship}".`);
      }),
  );
