import { Command, EnumType } from "@cliffy/command";
import { releaseNext, releaseSet, releaseUndo, type ReleasePreview } from "@ensemble/core";

function resolveRemote(remote: string | true | undefined): string | undefined {
  return remote === true ? "origin" : remote;
}

function printPreview(label: string, preview: ReleasePreview, pushedTo: string | undefined): void {
  console.log(`${label} tag: ${preview.tag}`);
  console.log(`  from: ${preview.lastTag ?? "(no previous tag)"}`);
  console.log(`  ${preview.commitMessages.length} commit message(s) collected into CHANGELOG.md`);
  if (pushedTo) console.log(`  pushed to: ${pushedTo}`);
}

const nextCommand = new Command()
  .description("Bump the version (patch, minor, or major) from the last tag and create a new release.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .arguments("<bump:bump>")
  .option("--dry-run", "Preview the tag without creating it.")
  .option("-p, --pre-release <suffix:string>", "Append a -<suffix> pre-release identifier.")
  .option("-m, --meta <suffix:string>", "Append a +<suffix> build metadata identifier.")
  .option("-r, --remote [name:string]", 'Push the tag after creating it. Defaults to "origin" if no name is given.')
  .action(async ({ dryRun, preRelease, meta, remote }, bump) => {
    const resolvedRemote = resolveRemote(remote);
    const preview = await releaseNext(bump, { dryRun, preRelease, meta, remote: resolvedRemote });
    printPreview(dryRun ? "Would create" : "Created", preview, dryRun ? undefined : resolvedRemote);
  });

const setCommand = new Command()
  .description("Set an arbitrary version (shape x.y.z) and create a new release.")
  .arguments("<version:string>")
  .option("--dry-run", "Preview the tag without creating it.")
  .option("-p, --pre-release <suffix:string>", "Append a -<suffix> pre-release identifier.")
  .option("-m, --meta <suffix:string>", "Append a +<suffix> build metadata identifier.")
  .option("-r, --remote [name:string]", 'Push the tag after creating it. Defaults to "origin" if no name is given.')
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const resolvedRemote = resolveRemote(remote);
    const preview = await releaseSet(version, { dryRun, preRelease, meta, remote: resolvedRemote });
    printPreview(dryRun ? "Would create" : "Created", preview, dryRun ? undefined : resolvedRemote);
  });

const undoCommand = new Command()
  .description("Deletes the last tag. Does not touch any commit, including a changelog commit from a previous release.")
  .option("--dry-run", "Preview which tag would be deleted without deleting it.")
  .option("-r, --remote [name:string]", 'Also delete the tag from this remote. Defaults to "origin" if no name is given.')
  .action(async ({ dryRun, remote }) => {
    const resolvedRemote = resolveRemote(remote);
    const result = await releaseUndo({ dryRun, remote: resolvedRemote });
    console.log(`${dryRun ? "Would delete" : "Deleted"} tag: ${result.tag}`);
    if (result.deletedFromRemote) {
      console.log(`  ${dryRun ? "would also delete" : "also deleted"} from remote: ${result.deletedFromRemote}`);
    }
  });

export const releaseCommand = new Command()
  .name("release")
  .description("Create or undo a semver release tag.")
  .command("next", nextCommand)
  .command("set", setCommand)
  .command("undo", undoCommand);
