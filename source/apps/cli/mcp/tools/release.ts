import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as Core from "@ensemble/core";
import { z } from "zod";
import { ToolResult } from "../tool-result.ts";
import { ToolRegistration } from "../tool-registration.ts";

interface ReleaseFilter {
  only?: string[];
  skip?: string[];
}

function filterByName<T>(items: T[], nameOf: (item: T) => string, filter: ReleaseFilter): T[] {
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
): Promise<{ ships: Core.Release.ShipRelease[]; coreLibs: Core.CoreLibRelease[] }> {
  const ceremony = new Core.Release.ReleaseCeremony(repoRoot);
  const ships = filterByName(await ceremony.collectShipReleases(), (s) => s.name, filter);
  const coreLibs = filterByName(
    await ceremony.collectCoreLibReleases(),
    (l) => l.declaration.package,
    filter,
  );
  return { ships, coreLibs };
}

function describeReleaseScope(
  ships: Core.Release.ShipRelease[],
  coreLibs: Core.CoreLibRelease[],
): string {
  const lines: string[] = [];
  if (ships.length > 0) {
    lines.push(`Ships: ${ships.map((s) => `${s.name} (via ${s.kit})`).join(", ")}`);
  }
  if (coreLibs.length > 0) {
    lines.push(`Core libs: ${coreLibs.map((l) => l.declaration.package).join(", ")}`);
  }
  return lines.length > 0 ? lines.join("\n") : "Nothing to build or publish for this tag.";
}

/**
 * Runs the same tag-then-ceremony flow `commands/release.ts` runs
 * interactively, minus the prompts: uncommitted changes and the
 * build/pack/publish ceremony both proceed unconditionally once `dryRun` is
 * false, and the tag/commits are always pushed to `remote` — there's no
 * agent-facing equivalent of "packed but held off on publishing."
 */
async function tagAndRunCeremony(
  repoRoot: string,
  release: Core.Release.ReleaseService,
  preview: Core.Release.ReleasePreview,
  remote: string,
  dryRun: boolean,
): Promise<string> {
  const { ships, coreLibs } = await collectReleases(repoRoot, {});
  const scope = describeReleaseScope(ships, coreLibs);
  if (dryRun) {
    return `Would create tag: ${preview.tag} (from ${preview.lastTag ?? "no previous tag"})\n${scope}`;
  }

  if (coreLibs.length > 0) {
    await new Core.Release.ReleaseCeremony(repoRoot).stampCoreLibs(coreLibs, preview.tag);
    await release.commitIfChanged(
      coreLibs.map((lib) => lib.libRoot),
      `chore(release): bump library versions for ${preview.tag}`,
    );
  }
  await release.createReleaseTag(preview);

  const ceremony = new Core.Release.ReleaseCeremony(repoRoot);
  if (ships.length > 0) await ceremony.packShips(ships);
  await release.pushCommits(remote);
  await release.pushTag(preview.tag, remote);
  if (ships.length > 0) await ceremony.publishShips(ships, preview.tag);
  if (coreLibs.length > 0) await ceremony.releaseCoreLibs(coreLibs, preview.tag);

  const hooks = new Core.Hooks.Hooks(repoRoot);
  const releaseHooks = await hooks.releaseAfter();
  for (const hook of releaseHooks) await hooks.run(hook, preview.tag);
  if (releaseHooks.length > 0) await release.pushCommits(remote);

  const released = [
    ...ships.map((s) => s.name),
    ...coreLibs.map((l) => l.declaration.package),
  ];
  return `Created tag: ${preview.tag}\n${
    released.length > 0 ? `Released: ${released.join(", ")}` : "Nothing to build or publish."
  }`;
}

async function requireCommittedOrConfirmed(
  release: Core.Release.ReleaseService,
  dryRun: boolean,
  confirmUncommittedChanges: boolean,
): Promise<void> {
  if (dryRun || !await release.hasUncommittedChanges()) return;
  if (!confirmUncommittedChanges) {
    throw new Error(
      "There are uncommitted changes — the release tag won't reflect them. " +
        "Pass confirmUncommittedChanges: true to proceed anyway.",
    );
  }
}

export class ReleaseTools {
  Register(server: McpServer): void {
    ToolRegistration.Register(
      server,
      "ensemble_release_next",
      {
        title: "Bump and create a release",
        description:
          "Bumps the version (patch/minor/major) from the last tag and creates a new release, " +
          "then packs and publishes every declared ship/library under it. Defaults to a dry-run preview.",
        inputSchema: {
          bump: z.enum(["patch", "minor", "major"]),
          dryRun: z.boolean().default(true).describe("Preview without making changes."),
          preRelease: z.string().optional().describe('Append a "-<suffix>" pre-release identifier.'),
          meta: z.string().optional().describe('Append a "+<suffix>" build metadata identifier.'),
          remote: z.string().default("origin").describe("Remote to push the tag/commits to."),
          confirmUncommittedChanges: z.boolean().default(false).describe(
            "Required to proceed (non-dry-run) when there are uncommitted changes.",
          ),
        },
      },
      ({ bump, dryRun, preRelease, meta, remote, confirmUncommittedChanges }) =>
        ToolResult.from(async () => {
          const repoRoot = await Core.findRepoRoot();
          const release = new Core.Release.ReleaseService(repoRoot);
          await requireCommittedOrConfirmed(release, dryRun, confirmUncommittedChanges);
          const preview = await release.next(bump, { dryRun, preRelease, meta });
          return await tagAndRunCeremony(repoRoot, release, preview, remote, dryRun);
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_release_set",
      {
        title: "Create a release at an arbitrary version",
        description:
          "Sets an arbitrary version (x.y.z) and creates a new release, then packs and publishes " +
          "every declared ship/library under it. Defaults to a dry-run preview.",
        inputSchema: {
          version: z.string().describe("Version to release, shape x.y.z."),
          dryRun: z.boolean().default(true).describe("Preview without making changes."),
          preRelease: z.string().optional().describe('Append a "-<suffix>" pre-release identifier.'),
          meta: z.string().optional().describe('Append a "+<suffix>" build metadata identifier.'),
          remote: z.string().default("origin").describe("Remote to push the tag/commits to."),
          confirmUncommittedChanges: z.boolean().default(false).describe(
            "Required to proceed (non-dry-run) when there are uncommitted changes.",
          ),
        },
      },
      ({ version, dryRun, preRelease, meta, remote, confirmUncommittedChanges }) =>
        ToolResult.from(async () => {
          const repoRoot = await Core.findRepoRoot();
          const release = new Core.Release.ReleaseService(repoRoot);
          await requireCommittedOrConfirmed(release, dryRun, confirmUncommittedChanges);
          const preview = await release.set(version, { dryRun, preRelease, meta });
          return await tagAndRunCeremony(repoRoot, release, preview, remote, dryRun);
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_release_resume",
      {
        title: "Resume a partially-failed release",
        description:
          "Re-runs the build/pack/publish ceremony for a tag that's already been created — for " +
          "finishing a release after a partial failure. Defaults to a dry-run preview.",
        inputSchema: {
          tag: z.string().describe("Existing local tag to resume."),
          dryRun: z.boolean().default(true).describe("Preview without making changes."),
          remote: z.string().default("origin").describe("Remote to push to."),
          only: z.array(z.string()).optional().describe("Ship/library names to include."),
          skip: z.array(z.string()).optional().describe("Ship/library names to exclude."),
        },
      },
      ({ tag, dryRun, remote, only, skip }) =>
        ToolResult.from(async () => {
          const repoRoot = await Core.findRepoRoot();
          const release = new Core.Release.ReleaseService(repoRoot);
          if (!await release.hasTag(tag)) {
            throw new Error(
              `No local tag "${tag}" — create it first with ensemble_release_next or ensemble_release_set.`,
            );
          }
          const filter: ReleaseFilter = { only, skip };
          const { ships, coreLibs } = await collectReleases(repoRoot, filter);
          const scope = describeReleaseScope(ships, coreLibs);
          if (dryRun) return `Would resume ${tag}:\n${scope}`;

          const ceremony = new Core.Release.ReleaseCeremony(repoRoot);
          if (ships.length > 0) await ceremony.packShips(ships);
          await release.pushCommits(remote);
          await release.pushTag(tag, remote);
          if (ships.length > 0) await ceremony.publishShips(ships, tag);
          if (coreLibs.length > 0) await ceremony.releaseCoreLibs(coreLibs, tag);

          const hooks = new Core.Hooks.Hooks(repoRoot);
          const releaseHooks = await hooks.releaseAfter();
          for (const hook of releaseHooks) await hooks.run(hook, tag);
          if (releaseHooks.length > 0) await release.pushCommits(remote);

          const released = [
            ...ships.map((s) => s.name),
            ...coreLibs.map((l) => l.declaration.package),
          ];
          return `Resumed ${tag}. Released: ${released.join(", ") || "(nothing)"}`;
        }),
    );

    ToolRegistration.Register(
      server,
      "ensemble_release_undo",
      {
        title: "Delete the last release tag",
        description: "Deletes the last tag locally, and optionally from a remote. Doesn't touch any commit.",
        inputSchema: {
          dryRun: z.boolean().default(true).describe("Preview without making changes."),
          remote: z.string().default("origin").describe("Remote to also delete the tag from."),
          deleteFromRemote: z.boolean().default(false).describe(
            "Also delete the tag from `remote`, not just locally.",
          ),
        },
      },
      ({ dryRun, remote, deleteFromRemote }) =>
        ToolResult.from(async () => {
          const repoRoot = await Core.findRepoRoot();
          const release = new Core.Release.ReleaseService(repoRoot);
          const result = await release.undo({ dryRun });
          if (dryRun) return `Would delete tag: ${result.tag}`;
          if (!deleteFromRemote) return `Deleted tag: ${result.tag}`;
          await release.deleteRemoteTag(result.tag, remote);
          return `Deleted tag: ${result.tag} (also from ${remote})`;
        }),
    );
  }
}
