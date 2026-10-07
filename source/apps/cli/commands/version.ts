import { Command, EnumType } from "@cliffy/command";
import * as Core from "@ensemble/core";
import { DownloadProgress } from "./download-progress.ts";

export const formatVersion = Core.Version.formatVersionTag;

/**
 * Runs one install against a SelfUpdateService whose binary download is
 * mirrored onto a stderr progress bar, then reports the outcome on stdout.
 */
async function installWithProgress(
  install: (selfUpdate: Core.Version.SelfUpdateService) => Promise<Core.Version.InstallResult>,
): Promise<void> {
  const selfUpdate = new Core.Version.SelfUpdateService();
  let progress: DownloadProgress | undefined;
  selfUpdate.OnDownloadStart.Do((tag, total) => {
    progress = new DownloadProgress(`Downloading ens ${tag}`);
    progress.Begin(total);
  });
  selfUpdate.OnDownloadProgress.Do((received, total) => progress?.Advance(received, total));

  console.error("Resolving release...");
  let result: Core.Version.InstallResult;
  try {
    result = await install(selfUpdate);
  } finally {
    progress?.Finish();
  }
  reportInstall(result);
}

function reportInstall(result: Core.Version.InstallResult): void {
  if (!result.changed) {
    console.log(`ens ${result.tag} is already installed`);
    return;
  }
  console.log(
    result.previous
      ? `Updated ens ${formatVersion(result.previous)} -> ${result.tag}`
      : `Installed ens ${result.tag}`,
  );
}

export const versionCommand = new Command()
  .name("version")
  .description("Show or change the installed ens version.")
  .action(async () => {
    const selfUpdate = new Core.Version.SelfUpdateService();
    const current = await selfUpdate.getInstalledVersion();
    console.log(current ? formatVersion(current) : "unknown (no install marker found)");
  })
  .command(
    "update",
    new Command()
      .description(
        "Install the newest release within a bump's scope (patch/minor/major) from the installed version, or the latest release when no bump is given.",
      )
      .type("bump", new EnumType(["patch", "minor", "major"]))
      .arguments("[bump:bump]")
      .action(async (_options, bump) => {
        if (!bump) return await installWithProgress((selfUpdate) => selfUpdate.installLatest());
        await installWithProgress((selfUpdate) => selfUpdate.installNext(bump));
      }),
  )
  .command(
    "set",
    new Command()
      .description("Install a specific released version, if it exists.")
      .arguments("<version:string>")
      .action(async (_options, version) => {
        await installWithProgress((selfUpdate) => selfUpdate.installSet(version));
      }),
  );
