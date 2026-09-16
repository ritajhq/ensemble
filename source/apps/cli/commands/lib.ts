import { Command, EnumType } from "@cliffy/command";
import {
  runLibContribute,
  runLibEject,
  runLibInstall,
  runLibNew,
  runLibPin,
  runLibPublish,
  runLibUpdate,
} from "@ensemble/core";
import * as Host from "@ensemble/host";

export const libCommand = new Command()
  .name("lib")
  .description("Manage libraries under source/libs/.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .command(
    "new",
    new Command()
      .description("Scaffold a new library at source/libs/<name>.")
      .arguments("<name:string>")
      .action(async (_, name) => {
        await runLibNew(name, Host.createPorts().repo);
        console.log(`Scaffolded source/libs/${name}.`);
      }),
  )
  .command(
    "install",
    new Command()
      .description(
        'Clone a lib from a git repository (optionally "<url>@<ref>") and install it into source/libs/<name>.',
      )
      .arguments("<url:string>")
      .action(async (_, url) => {
        const entry = await runLibInstall(
          url,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
        console.log(
          `Installed lib at ${entry.path} (${entry.repo}@${entry.ref}).`,
        );
      }),
  )
  .command(
    "eject",
    new Command()
      .description(
        "Push source/libs/<name> to its own repository and register it as a vendored checkout.",
      )
      .option("--remote <url:string>", "Git remote to push the library to.", {
        required: true,
      })
      .arguments("<name:string>")
      .action(async ({ remote }, name) => {
        const entry = await runLibEject(
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
      .description("Move a vendored lib's checkout to a different ref.")
      .arguments("<name:string> <ref:string>")
      .action(async (_, name, ref) => {
        const entry = await runLibPin(
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
        "Move a vendored lib to its next patch/minor/major tag (defaults to patch).",
      )
      .arguments("<name:string> [bump:bump]")
      .action(async (_, name, bump) => {
        const entry = await runLibUpdate(
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
        "Push a vendored lib's local change upstream and open a PR against its remote.",
      )
      .arguments("<name:string>")
      .action(async (_, name) => {
        const pr = await runLibContribute(
          name,
          Host.createPorts().repo,
          new Host.GitPackageSource(),
        );
        console.log(`Opened pull request: ${pr.url}`);
      }),
  )
  .command(
    "publish",
    new Command()
      .description(
        "Publish source/libs/<name> through one of its declared kits, outside ens release.",
      )
      .arguments("<name:string> <kit:string> <version:string>")
      .action(async (_, name, kit, version) => {
        await runLibPublish(name, kit, version, Host.createPorts());
        console.log(`Published ${name} via ${kit} @ ${version}.`);
      }),
  );
