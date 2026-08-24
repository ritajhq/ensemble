import { Command, EnumType } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import * as Core from "@ensemble/core";

async function confirmUncommittedChanges(release: Core.Release.ReleaseService): Promise<boolean> {
  if (!await release.hasUncommittedChanges()) return true;
  console.log("Warning: you have uncommitted changes. The release tag won't reflect them.");
  return await Confirm.prompt({ message: "Continue anyway?", default: false });
}

function printPreview(label: string, preview: Core.Release.ReleasePreview): void {
  console.log(`${label} tag: ${preview.tag}`);
  console.log(`  from: ${preview.lastTag ?? "(no previous tag)"}`);
}

/** Creates the tag locally, then optionally pushes it — both only after the caller has answered every prompt. */
async function createAndMaybePushRelease(
  release: Core.Release.ReleaseService,
  preview: Core.Release.ReleasePreview,
  remote: string,
): Promise<void> {
  const push = await Confirm.prompt({ message: `Push commits and tag to "${remote}"?`, default: false });
  await release.createReleaseTag(preview);
  console.log(`Created tag: ${preview.tag}`);
  if (!push) return;
  await release.pushCommits(remote);
  await release.pushTag(preview.tag, remote);
  console.log(`  pushed to: ${remote}`);
}

export const releaseCommand = new Command()
  .name("release")
  .description("Create or undo a semver release tag.")
  .globalOption("--dry-run", "Preview without making changes.")
  .globalOption("-p, --pre-release <suffix:string>", "Append a -<suffix> pre-release identifier. Ignored by undo.")
  .globalOption("-m, --meta <suffix:string>", "Append a +<suffix> build metadata identifier. Ignored by undo.")
  .globalOption("-r, --remote <name:string>", 'Remote to push to/delete from when confirmed. Defaults to "origin".', { default: "origin" })
  .command("next", "Bump the version (patch, minor, or major) from the last tag and create a new release.")
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .arguments("<bump:bump>")
  .action(async ({ dryRun, preRelease, meta, remote }, bump) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.next(bump, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) return;
    await createAndMaybePushRelease(release, preview, remote);
  })
  .reset()
  .command("set", "Set an arbitrary version (shape x.y.z) and create a new release.")
  .arguments("<version:string>")
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.set(version, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) return;
    await createAndMaybePushRelease(release, preview, remote);
  })
  .reset()
  .command("undo", "Deletes the last tag. Does not touch any commit.")
  .action(async ({ dryRun, remote }) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    const result = await release.undo({ dryRun });
    console.log(`${dryRun ? "Would delete" : "Deleted"} tag: ${result.tag}`);
    if (dryRun) return;
    const deleteFromRemote = await Confirm.prompt({
      message: `Also delete "${result.tag}" from remote "${remote}"?`,
      default: false,
    });
    if (!deleteFromRemote) return;
    await release.deleteRemoteTag(result.tag, remote);
    console.log(`  also deleted from remote: ${remote}`);
  })
  .reset();
