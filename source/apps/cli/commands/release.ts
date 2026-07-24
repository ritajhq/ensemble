import { Command, EnumType } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import {
  deleteRemoteTag,
  findRepoRoot,
  hasUncommittedChanges,
  pushCommits,
  pushTag,
  releaseNext,
  releaseSet,
  releaseUndo,
  type ReleasePreview,
} from "@ensemble/core";

async function confirmUncommittedChanges(repoRoot: string): Promise<boolean> {
  if (!await hasUncommittedChanges(repoRoot)) return true;
  console.log("Warning: you have uncommitted changes. The release tag won't reflect them.");
  return await Confirm.prompt({ message: "Continue anyway?", default: false });
}

function printPreview(label: string, preview: ReleasePreview): void {
  console.log(`${label} tag: ${preview.tag}`);
  console.log(`  from: ${preview.lastTag ?? "(no previous tag)"}`);
}

async function maybePushRelease(repoRoot: string, tag: string, remote: string): Promise<void> {
  const push = await Confirm.prompt({ message: `Push commits and tag to "${remote}"?`, default: false });
  if (!push) return;
  await pushCommits(repoRoot, remote);
  await pushTag(repoRoot, tag, remote);
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
    const repoRoot = await findRepoRoot();
    if (!dryRun && !await confirmUncommittedChanges(repoRoot)) return;
    const preview = await releaseNext(bump, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Created", preview);
    if (!dryRun) await maybePushRelease(repoRoot, preview.tag, remote);
  })
  .reset()
  .command("set", "Set an arbitrary version (shape x.y.z) and create a new release.")
  .arguments("<version:string>")
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const repoRoot = await findRepoRoot();
    if (!dryRun && !await confirmUncommittedChanges(repoRoot)) return;
    const preview = await releaseSet(version, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Created", preview);
    if (!dryRun) await maybePushRelease(repoRoot, preview.tag, remote);
  })
  .reset()
  .command("undo", "Deletes the last tag. Does not touch any commit.")
  .action(async ({ dryRun, remote }) => {
    const repoRoot = await findRepoRoot();
    const result = await releaseUndo({ dryRun });
    console.log(`${dryRun ? "Would delete" : "Deleted"} tag: ${result.tag}`);
    if (dryRun) return;
    const deleteFromRemote = await Confirm.prompt({
      message: `Also delete "${result.tag}" from remote "${remote}"?`,
      default: false,
    });
    if (!deleteFromRemote) return;
    await deleteRemoteTag(repoRoot, result.tag, remote);
    console.log(`  also deleted from remote: ${remote}`);
  })
  .reset();
