import { Command, EnumType } from "@cliffy/command";
import {
  runKitContribute,
  runKitInstall,
  runKitPin,
  runKitUpdate,
} from "@ensemble/core";

export const kitCommand = new Command()
  .name("kit")
  .description("Install kits from external repositories.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .command(
    "install",
    new Command()
      .description(
        'Clone a kit from a git repository (optionally "<url>@<ref>") and install it into .ensemble/kits/<role>/<name>.',
      )
      .arguments("<url:string>")
      .action(async (_, url) => {
        const entry = await runKitInstall(url);
        console.log(
          `Installed kit at ${entry.path} (${entry.repo}@${entry.ref}).`,
        );
      }),
  )
  .command(
    "pin",
    new Command()
      .description("Move an installed kit's checkout to a different ref.")
      .arguments("<name:string> <ref:string>")
      .action(async (_, name, ref) => {
        const entry = await runKitPin(name, ref);
        console.log(`Pinned ${entry.path} to ${entry.repo}@${entry.ref}.`);
      }),
  )
  .command(
    "update",
    new Command()
      .description(
        "Move an installed kit to its next patch/minor/major tag (defaults to patch).",
      )
      .arguments("<name:string> [bump:bump]")
      .action(async (_, name, bump) => {
        const entry = await runKitUpdate(
          name,
          bump as "patch" | "minor" | "major" | undefined,
        );
        console.log(`Updated ${entry.path} to ${entry.repo}@${entry.ref}.`);
      }),
  )
  .command(
    "contribute",
    new Command()
      .description(
        "Push an installed kit's local change upstream and open a PR against its remote.",
      )
      .arguments("<name:string>")
      .action(async (_, name) => {
        const pr = await runKitContribute(name);
        console.log(`Opened pull request: ${pr.url}`);
      }),
  );
