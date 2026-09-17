import { Command, EnumType } from "@cliffy/command";
import {
  runKitContribute,
  runKitEject,
  runKitInstall,
  runKitNew,
  runKitPin,
  runKitUpdate,
} from "@ensemble/core";
import * as Host from "@ensemble/host";

export const kitCommand = new Command()
  .name("kit")
  .description("Author, install, and manage kits under .ensemble/kits/.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .type("role", new EnumType(["build", "pack", "deploy", "lib"]))
  .command(
    "new",
    new Command()
      .description("Scaffold a new kit at .ensemble/kits/<role>/<name>.")
      .arguments("<name:string> <role:role>")
      .action(async (_, name, role) => {
        await runKitNew(
          name,
          role as "build" | "pack" | "deploy" | "lib",
          Host.createPorts().repo,
        );
        console.log(`Scaffolded .ensemble/kits/${role}/${name}.`);
      }),
  )
  .command(
    "install",
    new Command()
      .description(
        'Clone a kit from a git repository (optionally "<url>@<ref>") and install it into .ensemble/kits/<role>/<name>.',
      )
      .arguments("<url:string>")
      .action(async (_, url) => {
        const entry = await runKitInstall(
          url,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
        console.log(
          `Installed kit at ${entry.path} (${entry.repo}@${entry.ref}).`,
        );
      }),
  )
  .command(
    "eject",
    new Command()
      .description(
        "Push a locally-authored kit to its own repository and register it as a vendored checkout.",
      )
      .arguments("<name:string> <remote:string>")
      .action(async (_, name, remote) => {
        const entry = await runKitEject(
          name,
          remote,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
        console.log(`Ejected ${entry.path} to ${entry.repo}@${entry.ref}.`);
      }),
  )
  .command(
    "pin",
    new Command()
      .description("Move an installed kit's checkout to a different ref.")
      .arguments("<name:string> <ref:string>")
      .action(async (_, name, ref) => {
        const entry = await runKitPin(
          name,
          ref,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
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
          Host.createPorts().repo,
          new Host.GitPackageSource(),
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
        const pr = await runKitContribute(
          name,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
        console.log(`Opened pull request: ${pr.url}`);
      }),
  );
