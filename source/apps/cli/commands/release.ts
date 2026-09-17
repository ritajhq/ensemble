import { join } from "@std/path";
import { Command, EnumType } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import * as Core from "@ensemble/core";
import * as Host from "@ensemble/host";

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
 * Pushes commits and the tag, unconditionally — once packing (or a bare tag
 * with nothing to build) has succeeded, there's nothing left for a human to
 * decide here, so this no longer asks. Some publish targets (e.g. a
 * GitHub-release publish) need the tag on the remote to attach a release to,
 * so this always runs before publishing starts.
 */
async function pushRelease(
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
): Promise<void> {
  await release.pushCommits(remote);
  await release.pushTag(tag, remote);
  console.log(`  pushed to: ${remote}`);
}

/** Which ships/libraries a ceremony run (or its preview) should include, by name — an explicit override on top of whatever `ReleaseState` already reports as done. */
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
  ports: Core.Ports,
  filter: ReleaseFilter,
): Promise<
  { ships: Core.Release.ShipRelease[]; coreLibs: Core.CoreLibRelease[] }
> {
  const ceremony = new Core.Release.ReleaseCeremony(repoRoot, ports);
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

/**
 * Stamps every core library's manifest with `tag` and commits the result —
 * unconditionally, like tag creation itself — so the tag ends up pointing at
 * a commit that actually carries the version bump. Must run before
 * `release.createReleaseTag`, never after. Includes the repo-root
 * `deno.lock` alongside each library's own directory: stamping spawns a
 * `deno run` subprocess per lib kit (see `LibKit.run`), and every such
 * invocation resolves the workspace's module graph against the
 * freshly-bumped versions, which Deno writes straight into `deno.lock` as a
 * side effect — left out here, that drift would just sit uncommitted.
 */
async function stampAndCommitCoreLibs(
  repoRoot: string,
  ports: Core.Ports,
  release: Core.Release.ReleaseService,
  tag: string,
): Promise<void> {
  const { coreLibs } = await collectReleases(repoRoot, ports, {});
  if (coreLibs.length === 0) return;
  await new Core.Release.ReleaseCeremony(repoRoot, ports).stampCoreLibs(
    coreLibs,
    tag,
  );
  await release.commitIfChanged(
    [...coreLibs.map((lib) => lib.libRoot), join(repoRoot, "deno.lock")],
    `chore(release): bump library versions for ${tag}`,
  );
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

/**
 * What's left to do for `tag`, after excluding whatever `ReleaseState`
 * already reports as packed/published — shared by the real ceremony run and
 * its dry-run preview, so the two can never disagree about "what's left."
 */
async function collectRemaining(
  repoRoot: string,
  ports: Core.Ports,
  filter: ReleaseFilter,
  state: Core.Release.ReleaseState,
): Promise<{
  shipsToPack: Core.Release.ShipRelease[];
  shipsToPublish: Core.Release.ShipRelease[];
  coreLibsToPublish: Core.CoreLibRelease[];
}> {
  const { ships, coreLibs } = await collectReleases(repoRoot, ports, filter);
  return {
    shipsToPack: ships.filter((s) => !state.packedShips.includes(s.name)),
    shipsToPublish: ships.filter((s) => !state.publishedShips.includes(s.name)),
    coreLibsToPublish: coreLibs.filter((l) =>
      !state.publishedCoreLibs.includes(l.declaration.package)
    ),
  };
}

/** Dry-run counterpart to `runReleaseCeremony`: reports what building/packing/publishing (and the release hook) would still run for `tag`, without doing any of it. */
async function printReleaseCeremonyPreview(
  repoRoot: string,
  ports: Core.Ports,
  tag: string,
  filter: ReleaseFilter = {},
): Promise<void> {
  const state = await new Core.Release.ReleaseStateStore(repoRoot).read(tag);
  const { shipsToPack, coreLibsToPublish } = await collectRemaining(
    repoRoot,
    ports,
    filter,
    state,
  );
  if (shipsToPack.length > 0) {
    console.log(
      `Would then build, pack, and publish ${shipsToPack.length} ship(s):`,
    );
    for (const ship of shipsToPack) {
      console.log(`  ${describeShipRelease(ship, tag)}`);
    }
  }

  if (coreLibsToPublish.length > 0) {
    console.log(
      `Would then publish ${coreLibsToPublish.length} core librar${
        coreLibsToPublish.length === 1 ? "y" : "ies"
      }:`,
    );
    for (const lib of coreLibsToPublish) {
      console.log(`  ${describeCoreLibRelease(lib, tag)}`);
    }
  }

  if (!state.hookRan) {
    await printReleaseHookPreview(repoRoot, ports);
  }
}

/**
 * Runs the configured `hooks.release.after` hooks in order, then pushes
 * whatever they committed (e.g. a changelog update) to `remote` — a hook
 * author shouldn't have to push their own commit any more than they have to
 * commit it in the first place. Caller is responsible for only invoking this
 * once per tag (see `ReleaseState.hookRan`) — re-running it duplicates
 * whatever the hook produces (e.g. a second changelog entry).
 */
async function runReleaseHook(
  repoRoot: string,
  ports: Core.Ports,
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
): Promise<void> {
  const hooks = new Core.Hooks.Hooks(repoRoot, ports.process);
  const releaseHooks = await hooks.releaseAfter();
  if (releaseHooks.length === 0) return;
  for (const hook of releaseHooks) {
    console.log(`Running "${hook.name}" hook...`);
    await hooks.run(hook, tag);
  }
  await release.pushCommits(remote);
}

/** Dry-run counterpart to `runReleaseHook`: reports the `hooks.release.after` hooks that would run, without running them. */
async function printReleaseHookPreview(
  repoRoot: string,
  ports: Core.Ports,
): Promise<void> {
  for (
    const hook of await new Core.Hooks.Hooks(repoRoot, ports.process)
      .releaseAfter()
  ) {
    console.log(`Would then run "${hook.name}" hook.`);
  }
}

/**
 * The part of the ceremony beyond git tagging: collects every ship declared
 * across every workload's `release:` section (deduplicated — see
 * `ReleaseCeremony.collectShipReleases`) and every core library declared
 * under `publish.core:` in `.ensemble/config.yaml` (`collectCoreLibReleases`),
 * narrows that down to whatever `ReleaseState` doesn't already report as
 * packed/published for `tag`, and — only if the caller confirms — packs,
 * pushes, and publishes the rest, then runs `hooks.release.after` exactly
 * once. Every successful step is persisted to `.ensemble/release/<tag>.json`
 * immediately (`ReleaseStateStore`), so a mid-ceremony failure leaves an
 * accurate record of what's left; the next `ens release resume <tag>` reads
 * that record and only redoes what didn't finish — including never
 * re-running the hook once `hookRan` is recorded. The state file is removed
 * once everything (ships, core libs, and the hook) has completed for `tag`.
 * No confirmation prompt after packing succeeds — once the ceremony is
 * running, pushing and publishing just proceed; the tag was already created
 * locally, and `resume` exists precisely to pick up whatever doesn't finish.
 */
async function runReleaseCeremony(
  repoRoot: string,
  ports: Core.Ports,
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
  filter: ReleaseFilter = {},
): Promise<void> {
  const store = new Core.Release.ReleaseStateStore(repoRoot);
  let state = await store.read(tag);
  const persist = async (next: Partial<Core.Release.ReleaseState>) => {
    state = { ...state, ...next };
    await store.write(state);
  };

  const { shipsToPack, shipsToPublish, coreLibsToPublish } =
    await collectRemaining(repoRoot, ports, filter, state);

  const hasWork = shipsToPack.length > 0 || shipsToPublish.length > 0 ||
    coreLibsToPublish.length > 0;

  if (hasWork) {
    if (shipsToPack.length > 0) {
      console.log(
        `Will build, pack, and publish ${shipsToPack.length} ship(s):`,
      );
      for (const ship of shipsToPack) {
        console.log(`  ${describeShipRelease(ship, tag)}`);
      }
    }
    if (coreLibsToPublish.length > 0) {
      console.log(
        `Will publish ${coreLibsToPublish.length} core librar${
          coreLibsToPublish.length === 1 ? "y" : "ies"
        }:`,
      );
      for (const lib of coreLibsToPublish) {
        console.log(`  ${describeCoreLibRelease(lib, tag)}`);
      }
    }
    const proceed = await Confirm.prompt({
      message: `Proceed for ${tag}?`,
      default: false,
    });
    if (!proceed) {
      console.log(
        `Tag ${tag} exists locally only — run "ens release resume ${tag}" whenever you're ready.`,
      );
      return;
    }

    const ceremony = new Core.Release.ReleaseCeremony(repoRoot, ports);
    try {
      await ceremony.packShips(
        shipsToPack,
        {
          pack: new Host.AnimatedPackReporter(),
          build: new Host.AnimatedBuildReporter(),
        },
        (ship) => persist({ packedShips: [...state.packedShips, ship.name] }),
      );
    } catch (error) {
      console.error(
        `Release failed while packing: ${(error as Error).message}`,
      );
      console.log(
        `Tag ${tag} is still local-only. Fix the issue, then run "ens release resume ${tag}" to try again.`,
      );
      return;
    }

    if (!state.pushed) {
      await pushRelease(release, tag, remote);
      await persist({ pushed: true });
    }

    try {
      await ceremony.publishShips(
        shipsToPublish,
        tag,
        (ship) =>
          persist({ publishedShips: [...state.publishedShips, ship.name] }),
      );
      await ceremony.releaseCoreLibs(
        coreLibsToPublish,
        tag,
        (lib) =>
          persist({
            publishedCoreLibs: [
              ...state.publishedCoreLibs,
              lib.declaration.package,
            ],
          }),
      );
    } catch (error) {
      console.error(
        `Release failed while publishing: ${(error as Error).message}`,
      );
      console.log(
        `Tag ${tag} is already on the remote, but not everything published under it yet. Fix the issue, then run "ens release resume ${tag}" (--only/--skip to narrow it down).`,
      );
      return;
    }

    const released = [
      ...shipsToPublish.map((s) => s.name),
      ...coreLibsToPublish.map((l) => l.declaration.package),
    ];
    if (released.length > 0) console.log(`Released: ${released.join(", ")}`);
  }

  // Whether the release is done *as a whole* — ignoring `--only`/`--skip`,
  // which narrow what this run touches but must never narrow what counts as
  // "finished". A filtered run leaving other work undone must not fire the
  // hook or clear the state file out from under it.
  const remaining = await collectRemaining(repoRoot, ports, {}, state);
  const everythingDone = remaining.shipsToPack.length === 0 &&
    remaining.shipsToPublish.length === 0 &&
    remaining.coreLibsToPublish.length === 0;
  if (!everythingDone) return;

  if (!state.pushed) {
    await pushRelease(release, tag, remote);
    await persist({ pushed: true });
  }
  if (!state.hookRan) {
    await runReleaseHook(repoRoot, ports, release, tag, remote);
    await persist({ hookRan: true });
  }
  await store.clear(tag);
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
    const ports = Host.createPorts();
    const repoRoot = await ports.repo.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot, ports.process);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.next(bump, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) {
      await printReleaseCeremonyPreview(repoRoot, ports, preview.tag);
      return;
    }
    await stampAndCommitCoreLibs(repoRoot, ports, release, preview.tag);
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    await runReleaseCeremony(repoRoot, ports, release, preview.tag, remote);
  })
  .reset()
  .command(
    "set",
    "Set an arbitrary version (shape x.y.z) and create a new release.",
  )
  .arguments("<version:string>")
  .action(async ({ dryRun, preRelease, meta, remote }, version) => {
    const ports = Host.createPorts();
    const repoRoot = await ports.repo.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot, ports.process);
    if (!dryRun && !await confirmUncommittedChanges(release)) return;
    const preview = await release.set(version, { dryRun, preRelease, meta });
    printPreview(dryRun ? "Would create" : "Will create", preview);
    if (dryRun) {
      await printReleaseCeremonyPreview(repoRoot, ports, preview.tag);
      return;
    }
    await stampAndCommitCoreLibs(repoRoot, ports, release, preview.tag);
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    await runReleaseCeremony(repoRoot, ports, release, preview.tag, remote);
  })
  .reset()
  .command(
    "resume",
    "Re-run the build/pack/publish ceremony for a tag that's already been created — for finishing a release after a partial failure. Picks up exactly where it left off (see .ensemble/release/<tag>.json) and never re-runs hooks.release.after (e.g. the changelog) once it's already run for this tag.",
  )
  .option(
    "--only <names:string>",
    "Comma-separated ship/library names to include (default: everything still left to do).",
  )
  .option(
    "--skip <names:string>",
    "Comma-separated ship/library names to exclude.",
  )
  .arguments("<tag:string>")
  .action(async ({ dryRun, remote, only, skip }, tag) => {
    const ports = Host.createPorts();
    const repoRoot = await ports.repo.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot, ports.process);
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
      await printReleaseCeremonyPreview(repoRoot, ports, tag, filter);
      return;
    }
    await runReleaseCeremony(repoRoot, ports, release, tag, remote, filter);
  })
  .reset()
  .command("undo", "Deletes the last tag. Does not touch any commit.")
  .action(async ({ dryRun, remote }) => {
    const ports = Host.createPorts();
    const repoRoot = await ports.repo.findRepoRoot();
    const release = new Core.Release.ReleaseService(repoRoot, ports.process);
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
