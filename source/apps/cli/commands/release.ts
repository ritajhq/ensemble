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

export const releaseCommand = new Command()
  .name("release")
  .description("Create or undo a semver release tag.")
  .globalOption("--dry-run", "Preview without making changes.")
  .globalOption("-p, --pre-release <suffix:string>", "Append a -<suffix> pre-release identifier. Ignored by undo.")
  .globalOption("-m, --meta <suffix:string>", "Append a +<suffix> build metadata identifier. Ignored by undo.")
  .globalOption("-r, --remote [name:string]", 'Push/delete on this remote. Defaults to "origin" if no name is given.')
  .command("next", "Bump the version (patch, minor, or major) from the last tag and create a new release.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .arguments("<bump:bump>")
  .action(async ({ dryRun, preRelease, meta, remote }, bump) => {
    const resolvedRemote = resolveRemote(remote);
    const preview = await releaseNext(bump, { dryRun, preRelease, meta, remote: resolvedRemote });
    printPreview(dryRun ? "Would create" : "Created", preview, dryRun ? undefined : resolvedRemote);
  })
  .reset()
  .command("set", "Set an arbitrary version (shape x.y.z) and create a new release.")
  .arguments("<version:string>")
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const resolvedRemote = resolveRemote(remote);
    const preview = await releaseSet(version, { dryRun, preRelease, meta, remote: resolvedRemote });
    printPreview(dryRun ? "Would create" : "Created", preview, dryRun ? undefined : resolvedRemote);
  })
  .reset()
  .command("undo", "Deletes the last tag. Does not touch any commit, including a changelog commit from a previous release.")
  .action(async ({ dryRun, remote }) => {
    const resolvedRemote = resolveRemote(remote);
    const result = await releaseUndo({ dryRun, remote: resolvedRemote });
    console.log(`${dryRun ? "Would delete" : "Deleted"} tag: ${result.tag}`);
    if (result.deletedFromRemote) {
      console.log(`  ${dryRun ? "would also delete" : "also deleted"} from remote: ${result.deletedFromRemote}`);
    }
  })
  .reset();
