import { join } from "@std/path";
import { exists } from "@std/fs";
import type * as Pack from "./pack-context.ts";
import type { Ports } from "./ports.ts";
import { KitProcess } from "./kit-process.ts";

/** What a pack depends on: the apps to build, then the packs to run, before it. */
export interface PackDependencies {
  artifacts: string[];
  packs: Pack.PackDependency[];
}

/**
 * Asks a pack kit which of `candidateApps` a ship's own packaging config
 * actually references — the same read-only, spawned-once-per-call pattern
 * `SubprocessPackKitGateway`'s describe/verify use, but answering "which
 * apps does this pack depend on" instead of "what's this release's
 * reference." Meant to run before `runPack`, so only the apps a ship
 * actually depends on need building first, not every declared app.
 *
 * `dependencies.ts` is optional per kit, like `describe.ts`/`verify.ts` — a
 * kit without one (deno.compile today) has nothing to say about which of its
 * candidates it depends on, so every candidate is returned unfiltered rather
 * than throwing; that's the same result a caller would get by skipping this
 * check entirely, so the capability being absent costs nothing.
 *
 * A kit may also name other packs it needs run first (`packs`), because it
 * reads what they wrote under the packages folder — a `docker` ship copying a
 * folder another kit packed, for one. Without `packs` it needs none.
 */
export async function resolvePackDependencies(
  shipName: string,
  kit: string,
  candidateApps: readonly string[],
  ports: Ports,
  deployKit?: string,
): Promise<PackDependencies> {
  const repoRoot = await ports.repo.findRepoRoot();
  const kitDir = join(repoRoot, ".ensemble", "kits", "pack", kit);
  const kitEntry = join(kitDir, "dependencies.ts");
  if (!await exists(kitEntry, { isFile: true })) {
    return { artifacts: [...candidateApps], packs: [] };
  }

  const shipDir = join(repoRoot, "source", "ship", shipName);

  const stdout = await new KitProcess(kitDir, ports).capture(
    "dependencies.ts",
    [
      "--apps",
      JSON.stringify(candidateApps),
      ...(deployKit ? ["--deploy-kit", deployKit] : []),
      shipDir,
    ],
  );

  const result = JSON.parse(stdout) as Pack.Result;
  const packs = result.packs ?? [];
  for (const pack of packs) {
    if (typeof pack?.ship === "string" && pack.ship !== "") continue;
    throw new Error(
      `Pack kit "${kit}" reported a pack dependency with no \`ship\` (${
        JSON.stringify(pack)
      }): name the ship whose pack ${shipName} needs, as { "ship": "<name>", "kit": "<kit>" }.`,
    );
  }
  return { artifacts: result.artifacts, packs };
}
