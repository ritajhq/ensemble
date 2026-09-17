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
 * Prompts to push commits and the tag. Called at two different points, each
 * with its own default: once packing has succeeded but before publishing
 * (some targets — e.g. a GitHub-release publish — need the tag on the remote
 * to attach a release to, so this is effectively required, default `true`),
 * and when there's nothing to build/publish at all (purely optional, default
 * `false`). Never called before packing succeeds — that's what keeps a pack
 * failure from ever reaching the remote.
 */
async function maybePushRelease(
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
  reason: string,
  defaultAnswer: boolean,
): Promise<boolean> {
  const push = await Confirm.prompt({
    message: `${reason} Push commits and tag "${tag}" to "${remote}"?`,
    default: defaultAnswer,
  });
  if (!push) return false;
  await release.pushCommits(remote);
  await release.pushTag(tag, remote);
  console.log(`  pushed to: ${remote}`);
  return true;
}

/** Thrown by `maybeRunReleaseCeremony` so `runCeremonySafely` can report accurately whether the tag reached the remote before the failure — packing failures never push; publishing failures always happen after the push. */
class CeremonyError extends Error {
  constructor(message: string, readonly pushed: boolean) {
    super(message);
  }
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
  await new Core.Release.ReleaseCeremony(repoRoot, ports).stampCoreLibs(coreLibs, tag);
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

/** Dry-run counterpart to `maybeRunReleaseCeremony`: reports what building/packing/publishing the tag would trigger, without doing any of it. */
async function printReleaseCeremonyPreview(
  repoRoot: string,
  ports: Core.Ports,
  tag: string,
  filter: ReleaseFilter = {},
): Promise<void> {
  const { ships, coreLibs } = await collectReleases(repoRoot, ports, filter);
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
 * Distinguishes why `maybeRunReleaseCeremony` stopped, since each case needs
 * different handling from the caller:
 * - `"completed"` — nothing to release, or everything published. Safe to run
 *   `hooks.release.after` next.
 * - `"declined"` — the user said no to the `Proceed?` prompt. The ceremony
 *   never touched ships/libraries; nothing downstream (hooks included) should
 *   run either.
 * - `"held-off"` — packing succeeded but the user declined to push, so
 *   publishing was skipped (some targets need the tag on the remote first).
 *   `resume` picks this back up; hooks must not run yet.
 */
type CeremonyOutcome = "completed" | "declined" | "held-off";

/**
 * The part of the ceremony beyond git tagging: collects every ship declared
 * across every workload's `release:` section (deduplicated — see
 * `ReleaseCeremony.collectShipReleases`) and every core library declared
 * under `publish.core:` in `.ensemble/config.yaml` (`collectCoreLibReleases`), and —
 * only if the caller confirms — packs every ship. Only once *all* of them
 * pack cleanly does it push the tag (some
 * publish targets, e.g. a GitHub release, need it on the remote to attach a
 * release to) and then publish each ship and each core library, all under
 * `tag`. A no-op if neither ships nor libraries exist. Anything to run
 * afterwards (e.g. a changelog update) is a configured `hooks.release.after`,
 * run separately — but only when this returns `"completed"`; see
 * `CeremonyOutcome`. Throws `CeremonyError` for an actual pack/publish
 * failure.
 */
async function maybeRunReleaseCeremony(
  repoRoot: string,
  ports: Core.Ports,
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
  filter: ReleaseFilter = {},
): Promise<CeremonyOutcome> {
  const { ships, coreLibs } = await collectReleases(repoRoot, ports, filter);
  if (ships.length === 0 && coreLibs.length === 0) {
    await maybePushRelease(
      release,
      tag,
      remote,
      "Nothing to build or publish for this tag.",
      false,
    );
    return "completed";
  }

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
  if (!proceed) {
    await maybePushRelease(
      release,
      tag,
      remote,
      "Skipping the build/publish ceremony.",
      false,
    );
    return "declined";
  }

  const ceremony = new Core.Release.ReleaseCeremony(repoRoot, ports);
  try {
    await ceremony.packShips(ships);
  } catch (error) {
    throw new CeremonyError((error as Error).message, false);
  }

  const pushed = await maybePushRelease(
    release,
    tag,
    remote,
    "Packing succeeded.",
    true,
  );
  if (!pushed) {
    console.log(
      `Packed everything, but held off on publishing — publishing (e.g. a GitHub release) needs "${tag}" on the remote first. Push it, then run "ens release resume ${tag}" to publish.`,
    );
    return "held-off";
  }

  try {
    await ceremony.publishShips(ships, tag);
    await ceremony.releaseCoreLibs(coreLibs, tag);
  } catch (error) {
    throw new CeremonyError((error as Error).message, true);
  }

  const released = [
    ...ships.map((s) => s.name),
    ...coreLibs.map((l) => l.declaration.package),
  ];
  console.log(`Released: ${released.join(", ")}`);
  return "completed";
}

/**
 * Runs the ceremony, catching `CeremonyError` instead of letting it crash the
 * process, and prints exactly one clear explanation of what state the tag was
 * left in — whether it reached the remote before the failure or not — rather
 * than the caller guessing or repeating itself. Returns `"completed"` only
 * when it's safe to run `hooks.release.after` next; every other outcome
 * (declined, held-off, or a caught `CeremonyError`) means the caller should
 * stop, and for a failure, point the user at `ens release resume`.
 */
async function runCeremonySafely(
  repoRoot: string,
  ports: Core.Ports,
  release: Core.Release.ReleaseService,
  tag: string,
  remote: string,
  filter: ReleaseFilter = {},
): Promise<CeremonyOutcome> {
  try {
    return await maybeRunReleaseCeremony(
      repoRoot,
      ports,
      release,
      tag,
      remote,
      filter,
    );
  } catch (error) {
    if (error instanceof CeremonyError) {
      console.error(`Release failed: ${error.message}`);
      console.log(
        error.pushed
          ? `Tag ${tag} is already on the remote, but not everything published under it yet. Fix the issue, then run "ens release resume ${tag}" (--only/--skip to narrow it down).`
          : `Tag ${tag} is still local-only — nothing was pushed or published. Fix the issue, then run "ens release resume ${tag}" to try again.`,
      );
      return "held-off";
    }
    console.error(`Release ceremony failed: ${(error as Error).message}`);
    return "held-off";
  }
}

/**
 * Runs the configured `hooks.release.after` hooks in order, once a release
 * has completed, then pushes whatever they committed (e.g. a changelog
 * update) to `remote` — a hook author shouldn't have to push their own
 * commit any more than they have to commit it in the first place.
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
async function printReleaseHookPreview(repoRoot: string, ports: Core.Ports): Promise<void> {
  for (const hook of await new Core.Hooks.Hooks(repoRoot, ports.process).releaseAfter()) {
    console.log(`Would then run "${hook.name}" hook.`);
  }
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
      await printReleaseHookPreview(repoRoot, ports);
      return;
    }
    await stampAndCommitCoreLibs(repoRoot, ports, release, preview.tag);
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    if (
      await runCeremonySafely(repoRoot, ports, release, preview.tag, remote) !==
        "completed"
    ) {
      return;
    }
    await runReleaseHook(repoRoot, ports, release, preview.tag, remote);
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
      await printReleaseHookPreview(repoRoot, ports);
      return;
    }
    await stampAndCommitCoreLibs(repoRoot, ports, release, preview.tag);
    await release.createReleaseTag(preview);
    console.log(`Created tag: ${preview.tag}`);
    if (
      await runCeremonySafely(repoRoot, ports, release, preview.tag, remote) !==
        "completed"
    ) {
      return;
    }
    await runReleaseHook(repoRoot, ports, release, preview.tag, remote);
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
      await printReleaseHookPreview(repoRoot, ports);
      return;
    }
    if (
      await runCeremonySafely(repoRoot, ports, release, tag, remote, filter) !==
        "completed"
    ) {
      return;
    }
    await runReleaseHook(repoRoot, ports, release, tag, remote);
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
