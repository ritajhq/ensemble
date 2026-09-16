import { Command, EnumType } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import * as Core from "@ensemble/core";

async function confirmUncommittedChanges(
  release: Core.Release.ReleaseService,
): Promise<boolean> {
  if (!await release.hasUncommittedChanges()) return true;
  console.log(
    "Warning: you have uncommitted changes. The release tag won't reflect them.",
  );
  return await Confirm.prompt({ message: "Continue anyway?", default: false });
}

function printPreview(
  label: string,
  preview: Core.Release.ReleasePreview,
): void {
  console.log(`${label} tag: ${preview.tag}`);
  console.log(`  from: ${preview.lastTag ?? "(no previous tag)"}`);
}

/**
 * Prompts to push commits and the tag, only once the caller has already
 * confirmed the ceremony either succeeded or had nothing to do — never
 * before. Pushing eagerly would publish a tag to the remote before ships or
 * libraries are actually built/published, so a mid-ceremony failure would
 * leave a public tag behind a broken release.
 */
async function maybePushRelease(
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
): Promise<void> {
  const push = await Confirm.prompt({
    message: `Push commits and tag "${tag}" to "${remote}"?`,
    default: false,
  });
  if (!push) return;
  await release.pushCommits(remote);
  await release.pushTag(tag, remote);
  console.log(`  pushed to: ${remote}`);
}

/** Which ships/libraries a ceremony run (or its preview) should include, by name — used by `resume` to retry only what's left after a partial failure. */
interface ReleaseFilter {
  only?: string[];
  skip?: string[];
}

function filterByName<T>(
  items: T[],
  nameOf: (item: T) => string,
  filter: ReleaseFilter,
): T[] {
  let result = items;
  if (filter.only) {
    const only = new Set(filter.only);
    result = result.filter((item) => only.has(nameOf(item)));
  }
  if (filter.skip) {
    const skip = new Set(filter.skip);
    result = result.filter((item) => !skip.has(nameOf(item)));
  }
  return result;
}

async function collectReleases(
  repoRoot: string,
  filter: ReleaseFilter,
): Promise<
  { ships: Core.Release.ShipRelease[]; coreLibs: Core.CoreLibRelease[] }
> {
  const ceremony = new Core.Release.ReleaseCeremony(repoRoot);
  const ships = filterByName(
    await ceremony.collectShipReleases(),
    (s) => s.name,
    filter,
  );
  const coreLibs = filterByName(
    await ceremony.collectCoreLibReleases(),
    (l) => l.declaration.package,
    filter,
  );
  return { ships, coreLibs };
}

/** How a ship would be packed and (if declared) published, for the confirm prompt and the dry-run preview. */
function describeShipRelease(
  ship: Core.Release.ShipRelease,
  tag: string,
): string {
  if (!ship.publish) {
    return `${ship.name} — pack via ${ship.kit} (not published)`;
  }
  const name = ship.publish.name ?? ship.outputName ?? ship.name;
  return `${ship.name} — pack via ${ship.kit}, publish to ${ship.publish.target} as "${name}" @ ${tag}`;
}

/** How a core library would be published, for the confirm prompt and the dry-run preview. */
function describeCoreLibRelease(lib: Core.CoreLibRelease, tag: string): string {
  const kits = lib.declaration.publish.map((entry) => entry.kit).join(", ") ||
    "(no publish entries declared)";
  return `${lib.declaration.package} — publish via ${kits} @ ${tag}`;
}

/** Dry-run counterpart to `maybeRunReleaseCeremony`: reports what building/packing/publishing the tag would trigger, without doing any of it. */
async function printReleaseCeremonyPreview(
  repoRoot: string,
  tag: string,
  filter: ReleaseFilter = {},
): Promise<void> {
  const { ships, coreLibs } = await collectReleases(repoRoot, filter);
  if (ships.length > 0) {
    console.log(`Would then build, pack, and publish ${ships.length} ship(s):`);
    for (const ship of ships) {
      console.log(`  ${describeShipRelease(ship, tag)}`);
    }
  }

  if (coreLibs.length > 0) {
    console.log(
      `Would then publish ${coreLibs.length} core librar${
        coreLibs.length === 1 ? "y" : "ies"
      }:`,
    );
    for (const lib of coreLibs) {
      console.log(`  ${describeCoreLibRelease(lib, tag)}`);
    }
  }
}

/**
 * The part of the ceremony beyond git tagging: collects every ship declared
 * across every workload's `release:` section (deduplicated — see
 * `ReleaseCeremony.collectShipReleases`) and every core library's `lib.yml`
 * (`collectCoreLibReleases`), and — only if the caller confirms — packs every
 * ship, and only once *all* of them pack cleanly, publishes each ship and
 * each core library, all under `tag`. Packing first and publishing second
 * (rather than pack-then-publish per ship) means a later ship's pack failure
 * is caught before an earlier ship — or any core library — ever gets
 * published. A no-op if neither ships nor libraries exist. Anything to run
 * afterwards (e.g. a changelog update) is a configured `hooks.release.after`,
 * run separately.
 */
async function maybeRunReleaseCeremony(
  repoRoot: string,
  tag: string,
  filter: ReleaseFilter = {},
): Promise<void> {
  const { ships, coreLibs } = await collectReleases(repoRoot, filter);
  if (ships.length === 0 && coreLibs.length === 0) return;

  if (ships.length > 0) {
    console.log(`Will build, pack, and publish ${ships.length} ship(s):`);
    for (const ship of ships) {
      console.log(`  ${describeShipRelease(ship, tag)}`);
    }
  }
  if (coreLibs.length > 0) {
    console.log(
      `Will publish ${coreLibs.length} core librar${
        coreLibs.length === 1 ? "y" : "ies"
      }:`,
    );
    for (const lib of coreLibs) {
      console.log(`  ${describeCoreLibRelease(lib, tag)}`);
    }
  }
  const proceed = await Confirm.prompt({
    message: `Proceed for ${tag}?`,
    default: false,
  });
  if (!proceed) return;

  const ceremony = new Core.Release.ReleaseCeremony(repoRoot);
  await ceremony.packShips(ships);
  await ceremony.publishShips(ships, tag);
  await ceremony.releaseCoreLibs(coreLibs, tag);
  const released = [
    ...ships.map((s) => s.name),
    ...coreLibs.map((l) => l.declaration.package),
  ];
  console.log(`Released: ${released.join(", ")}`);
}

/**
 * Runs the ceremony, catching a failure instead of letting it crash the
 * process — the caller uses the returned success flag to decide whether it's
 * safe to push the tag. `false` means some ship or library never got
 * published; the tag is left local-only, and the caller should point the
 * user at `ens release resume`.
 */
async function runCeremonySafely(
  repoRoot: string,
  tag: string,
  filter: ReleaseFilter = {},
): Promise<boolean> {
  try {
    await maybeRunReleaseCeremony(repoRoot, tag, filter);
    return true;
  } catch (error) {
    console.error(`Release ceremony failed: ${(error as Error).message}`);
    return false;
  }
}

/** Runs the configured `hooks.release.after` command once a release has completed, if any is set. */
async function runReleaseHook(repoRoot: string, tag: string): Promise<void> {
  const hooks = new Core.Hooks.Hooks(repoRoot);
  const command = await hooks.releaseAfter();
  if (!command) return;
  console.log(`Running release.after hook: ${command}`);
  await hooks.run(command, tag);
}

/** Dry-run counterpart to `runReleaseHook`: reports the `hooks.release.after` command that would run, without running it. */
async function printReleaseHookPreview(repoRoot: string): Promise<void> {
  const command = await new Core.Hooks.Hooks(repoRoot).releaseAfter();
  if (command) console.log(`Would then run release.after hook: ${command}`);
}

export const releaseCommand = new Command()
  .name("release")
  .description("Create or undo a semver release tag.")
  .globalOption("--dry-run", "Preview without making changes.")
  .globalOption(
    "-p, --pre-release <suffix:string>",
    "Append a -<suffix> pre-release identifier. Ignored by undo and resume.",
  )
  .globalOption(
    "-m, --meta <suffix:string>",
    "Append a +<suffix> build metadata identifier. Ignored by undo and resume.",
  )
  .globalOption(
    "-r, --remote <name:string>",
    'Remote to push to/delete from when confirmed. Defaults to "origin".',
    { default: "origin" },
  )
  .command(
    "next",
    "Bump the version (patch, minor, or major) from the last tag and create a new release.",
  )
  .type("bump", new EnumType(["patch", "minor", "major"]))
  .arguments("<bump:bump>")
  .action(async ({ dryRun, preRelease, meta, remote }, bump) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.next(bump, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) {
      await printReleaseCeremonyPreview(repoRoot, preview.tag);
      await printReleaseHookPreview(repoRoot);
      return;
    }
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    if (!await runCeremonySafely(repoRoot, preview.tag)) {
      console.log(
        `Tag ${preview.tag} was created locally but not pushed — the release didn't fully publish.`,
      );
      console.log(
        `Fix the issue, then run "ens release resume ${preview.tag}" to finish the rest.`,
      );
      return;
    }
    await maybePushRelease(release, preview.tag, remote);
    await runReleaseHook(repoRoot, preview.tag);
  })
  .reset()
  .command(
    "set",
    "Set an arbitrary version (shape x.y.z) and create a new release.",
  )
  .arguments("<version:string>")
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.set(version, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) {
      await printReleaseCeremonyPreview(repoRoot, preview.tag);
      await printReleaseHookPreview(repoRoot);
      return;
    }
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    if (!await runCeremonySafely(repoRoot, preview.tag)) {
      console.log(
        `Tag ${preview.tag} was created locally but not pushed — the release didn't fully publish.`,
      );
      console.log(
        `Fix the issue, then run "ens release resume ${preview.tag}" to finish the rest.`,
      );
      return;
    }
    await maybePushRelease(release, preview.tag, remote);
    await runReleaseHook(repoRoot, preview.tag);
  })
  .reset()
  .command(
    "resume",
    "Re-run the build/pack/publish ceremony for a tag that's already been created — for finishing a release after a partial failure.",
  )
  .option(
    "--only <names:string>",
    "Comma-separated ship/library names to include (default: everything discovered).",
  )
  .option(
    "--skip <names:string>",
    "Comma-separated ship/library names to exclude.",
  )
  .arguments("<tag:string>")
  .action(async ({ dryRun, remote, only, skip }, tag) => {
    const repoRoot = await Core.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot);
    if (!await release.hasTag(tag)) {
      throw new Error(
        `No local tag "${tag}" — create it first with "ens release next" or "ens release set".`,
      );
    }
    const filter: ReleaseFilter = {
      only: only?.split(",").map((name) => name.trim()),
      skip: skip?.split(",").map((name) => name.trim()),
    };
    if (dryRun) {
      await printReleaseCeremonyPreview(repoRoot, tag, filter);
      await printReleaseHookPreview(repoRoot);
      return;
    }
    if (!await runCeremonySafely(repoRoot, tag, filter)) {
      console.log(
        `Tag ${tag} still hasn't fully published. Fix the issue, then run "ens release resume ${tag}" again (--only/--skip to narrow it down).`,
      );
      return;
    }
    await maybePushRelease(release, tag, remote);
    await runReleaseHook(repoRoot, tag);
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
