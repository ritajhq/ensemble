import { Command, EnumType } from "@cliffy/command";
import { getInstalledVersion, installNext, installSet } from "@ensemble/core";

function formatVersion(v: { major: number; minor: number; patch: number; preRelease?: string }): string {
  return `${v.major}.${v.minor}.${v.patch}${v.preRelease ? `-${v.preRelease}` : ""}`;
}

export const versionCommand = new Command()
  .name("version")
  .description("Show or change the installed ens version.")
  .action(async () => {
    const current = await getInstalledVersion();
    console.log(current ? formatVersion(current) : "unknown (no install marker found)");
  })
  .command(
    "next",
    new Command()
      .description("Install the newest release within a bump's scope (patch/minor/major) from the installed version.")
      .type("bump", new EnumType(["patch", "minor", "major"]))
      .arguments("<bump:bump>")
      .action(async (_options, bump) => {
        const result = await installNext(bump);
        console.log(
          result.previous
            ? `Updated ens ${formatVersion(result.previous)} -> ${result.tag}`
            : `Installed ens ${result.tag}`,
        );
      }),
  )
  .command(
    "set",
    new Command()
      .description("Install a specific released version, if it exists.")
      .arguments("<version:string>")
      .action(async (_options, version) => {
        const result = await installSet(version);
        console.log(
          result.previous
            ? `Updated ens ${formatVersion(result.previous)} -> ${result.tag}`
            : `Installed ens ${result.tag}`,
        );
      }),
  );
